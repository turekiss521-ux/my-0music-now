// ==================== 全局变量 ====================
const APIS = {
  main: "https://music-api.gdstudio.xyz/api.php",
  backup1: "https://api.uomg.com/api/v1/music",  // 备选1: 支持多源，格式类似
  backup2: "https://binaryify.github.io/NeteaseCloudMusicApi"  // 备选2: 网易专属fallback
};
let currentApi = APIS.main;  // 当前API
let playlist = JSON.parse(localStorage.getItem('playlist') || '[]');
let currentIndex = parseInt(localStorage.getItem('currentIndex') || '0');
let lyricLines = [];
let audio = document.getElementById('audio');

// 请求限流：5分钟60次（只限搜索）
const RATE_LIMIT_KEY = 'search_requests';
const RATE_LIMIT_WINDOW = 5 * 60 * 1000;  // 5分钟ms
const RATE_LIMIT_MAX = 60;

// ==================== DOM 选择器 ====================
const $ = id => document.getElementById(id);
const searchInput = $('searchInput');
const sourceSelect = $('sourceSelect');
const searchBtn = $('searchBtn');
const results = $('results');
const playBtn = $('playBtn');
const prevBtn = $('prevBtn');
const nextBtn = $('nextBtn');
const titleEl = $('title');
const artistEl = $('artist');
const coverEl = $('cover');
const progressFill = $('progressFill');
const currentTimeEl = $('currentTime');
const durationEl = $('duration');
const volumeSlider = $('volumeSlider');
const playlistUl = $('playlistUl');
const playlistPanel = $('playlist');
const closePlaylist = $('closePlaylist');
const clearPlaylist = $('clearPlaylist');
const lyricContainer = $('lyricContainer');
const progressBar = document.querySelector('.progress-bar');

// ==================== 初始化 ====================
volumeSlider.value = localStorage.getItem('volume') || 80;
audio.volume = volumeSlider.value / 100;
renderPlaylist();
if (playlist.length > 0 && currentIndex < playlist.length) playCurrent();

// ==================== 限流检查 ====================
function checkRateLimit() {
  let requests = JSON.parse(localStorage.getItem(RATE_LIMIT_KEY) || '[]');
  const now = Date.now();
  // 保留5分钟内请求
  requests = requests.filter(time => now - time < RATE_LIMIT_WINDOW);
  if (requests.length >= RATE_LIMIT_MAX) {
    const waitTime = Math.ceil((RATE_LIMIT_WINDOW - (now - requests[0])) / 1000 / 60);  // 剩余分钟
    alert(`请求过多，5分钟内最多60次搜索。请${waitTime}分钟后重试。`);
    searchBtn.disabled = true;
    setTimeout(() => { searchBtn.disabled = false; }, RATE_LIMIT_WINDOW - (now - requests[0]));
    return false;
  }
  requests.push(now);
  localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(requests));
  return true;
}

// ==================== API 调用包装（带备用） ====================
async function apiFetch(endpoint, params, type = 'search') {  // type: search/url/lyric/pic
  const apis = [APIS.main, APIS.backup1, APIS.backup2];
  let lastError = null;
  for (let api of apis) {
    try {
      let url;
      if (api === APIS.main) {
        // 原API格式
        url = `${api}${endpoint}?${new URLSearchParams(params).toString()}`;
      } else if (api === APIS.backup1) {
        // UOMG格式: /music.{type}?mid=ID&format=json (需适配搜索用keyword)
        if (type === 'search') {
          url = `${api}/music.search?keyword=${params.name}&count=${params.count || 30}&type=${params.source}`;
        } else {
          url = `${api}/music.${type}?mid=${params.id}&format=json&type=${params.source}`;
        }
      } else {  // NeteaseCloudMusicApi (只支持netease)
        if (params.source !== 'netease') continue;  // 只fallback netease
        url = `${api}/${type}?id=${params.id}`;
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data && (type === 'search' ? data.length > 0 : data.url || data.lyric)) {
        currentApi = api;  // 成功切换当前API
        return data;
      }
      lastError = new Error('Empty response');
    } catch (e) {
      lastError = e;
      console.warn(`API ${api} failed:`, e);
    }
  }
  throw lastError || new Error('All APIs failed');
}

// ==================== 搜索功能 ====================
searchBtn.onclick = () => search();
searchInput.addEventListener('keydown', e => e.key === 'Enter' && search());

async function search(page = 1) {
  if (!checkRateLimit()) return;  // 限流检查

  const keyword = searchInput.value.trim();
  if (!keyword) return alert('请输入关键词');
  
  results.innerHTML = '<div class="loading">搜索中...</div>';
  const source = sourceSelect.value;
  const params = { types: 'search', source, name: keyword, count: 30, pages: page };
  
  try {
    const data = await apiFetch('', params, 'search');  // 用包装函数
    
    results.innerHTML = '';
    if (!data || data.length === 0) {
      results.innerHTML = '<p>未找到结果，试试换个关键词或音乐源</p>';
      return;
    }
    
    // 适配不同API响应（统一到原格式）
    const songs = data.map(song => ({
      id: song.id || song.songmid || song.rid,
      name: song.name || song.songname,
      artist: Array.isArray(song.artist) ? song.artist.map(a => a.name) : [song.singer || song.artist],
      album: song.album || song.albumname,
      pic_id: song.pic_id || song.albumpic || song.img,
      lyric_id: song.lyric_id || song.id,
      source
    }));
    
    songs.forEach((song, idx) => {
      const div = document.createElement('div');
      div.className = 'song-item';
      
      // 预加载封面
      const picUrl = await loadCover(song);  // 异步加载，确保显示
      div.innerHTML = `
        <img src="${picUrl}" alt="cover" style="width:60px;height:60px;border-radius:8px;object-fit:cover;">
        <div class="info">
          <h4>${song.name}</h4>
          <p>${song.artist.join(' / ')} - ${song.album}</p>
        </div>
      `;
      div.ondblclick = () => addToPlaylist(song, false);
      div.onclick = (e) => { if (e.detail === 1) addToPlaylistAndPlay(song); };
      results.appendChild(div);
    });
  } catch (e) {
    results.innerHTML = '<p style="color:red">搜索失败，所有API不可用。请刷新重试。</p>';
    console.error('Search error:', e);
  }
}

// ==================== 封面加载（优化+缓存） ====================
async function loadCover(song) {
  const cacheKey = `pic_${song.source}_${song.pic_id}`;
  const cached = localStorage.getItem(cacheKey);
  if (cached) return cached;
  
  let picUrl;
  try {
    const params = { types: 'pic', source: song.source, id: song.pic_id, size: 300 };
    const data = await apiFetch('', params, 'pic');
    picUrl = data.url || data.cover;  // 适配响应
  } catch (e) {
    console.warn('Cover fetch failed:', e);
  }
  
  // Fallback: 歌手头像或占位
  if (!picUrl || !picUrl.startsWith('http')) {
    picUrl = song.artist[0]?.pic || 'https://via.placeholder.com/60?text=No+Cover';
  }
  
  // 缓存1小时
  localStorage.setItem(cacheKey, picUrl);
  setTimeout(() => localStorage.removeItem(cacheKey), 60 * 60 * 1000);
  
  return picUrl;
}

// ==================== 播放控制 ====================
function addToPlaylist(song, playNow = true) {
  const existIdx = playlist.findIndex(s => s.id === song.id && s.source === song.source);
  if (existIdx !== -1) {
    if (playNow) currentIndex = existIdx;
  } else {
    song.source = song.source || sourceSelect.value;
    playlist.push(song);
    if (playNow) currentIndex = playlist.length - 1;
  }
  savePlaylist();
  renderPlaylist();
  if (playNow) playCurrent();
}

function addToPlaylistAndPlay(song) {
  addToPlaylist(song, true);
}

async function playCurrent() {
  const song = playlist[currentIndex];
  if (!song) return;

  titleEl.textContent = song.name;
  artistEl.textContent = song.artist.join(' / ');
  
  // 加载封面
  coverEl.src = await loadCover(song);
  coverEl.onerror = () => { coverEl.src = 'https://via.placeholder.com/60?text=Error'; };

  // 获取播放 URL（带备用+降级）
  let urlData = null;
  const brLevels = [999, 320, 128];
  const fallbackSources = ['kuwo', 'migu', 'tencent'];
  let triedSources = [song.source];

  for (let br of brLevels) {
    for (let fbSource of [song.source, ...fallbackSources.filter(s => !triedSources.includes(s))]) {
      try {
        const params = { types: 'url', source: fbSource, id: song.id, br };
        urlData = await apiFetch('', params, 'url');
        // 适配响应
        if (urlData && urlData.url && !urlData.url.includes('douyin.com') && (urlData.url.includes('.mp3') || urlData.url.includes('.m4a'))) {
          song.source = fbSource;
          console.log('Play URL success:', urlData.url, 'Source:', fbSource);
          break;
        }
      } catch (e) {
        console.warn(`URL fetch failed for ${fbSource} br=${br}:`, e);
      }
      triedSources.push(fbSource);
    }
    if (urlData && urlData.url) break;
  }

  if (!urlData || !urlData.url) {
    alert('加载歌曲失败：所有API/源无效。建议换源重搜。');
    return;
  }

  audio.src = urlData.url;
  audio.play().catch(e => alert('播放失败：' + e.message));
  playBtn.innerHTML = '<i class="fas fa-pause"></i>';

  // 加载歌词（带备用）
  fetchLyric(song);
  highlightPlaylist();
  localStorage.setItem('currentIndex', currentIndex);
}

function fetchLyric(song) {
  lyricContainer.classList.remove('show');
  lyricContainer.innerHTML = '<div>加载歌词中...</div>';
  const params = { types: 'lyric', source: song.source, id: song.lyric_id || song.id };
  apiFetch('', params, 'lyric')
    .then(data => {
      const lrc = data.lyric || data.lrc || '';
      if (lrc) {
        lyricLines = parseLrc(lrc);
        lyricContainer.innerHTML = '<div>歌词加载完成</div>';
      } else {
        lyricContainer.innerHTML = '<div>暂无歌词</div>';
      }
    })
    .catch(() => {
      lyricContainer.innerHTML = '<div>歌词加载失败</div>';
    });
}

// LRC 解析函数
function parseLrc(lrc) {
  const lines = lrc.split('\n');
  const result = [];
  const timeReg = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;
  lines.forEach(line => {
    const match = timeReg.exec(line);
    if (match) {
      const min = parseInt(match[1]);
      const sec = parseInt(match[2]);
      const ms = parseInt(match[3]) / 1000;
      const time = min * 60 + sec + ms;
      const text = line.replace(timeReg, '').trim();
      if (text) result.push({ time, text });
    }
  });
  return result.sort((a, b) => a.time - b.time);
}

// ==================== 事件监听 ====================
audio.addEventListener('timeupdate', () => {
  const curTime = audio.currentTime;
  const activeLine = lyricLines.find((line, idx) => 
    line.time <= curTime && (!lyricLines[idx + 1] || lyricLines[idx + 1].time > curTime)
  );
  if (activeLine) {
    lyricContainer.innerHTML = `<div>${activeLine.text}</div>`;
    lyricContainer.classList.add('show');
  }

  const percent = audio.duration ? (curTime / audio.duration) * 100 : 0;
  progressFill.style.width = percent + '%';
  currentTimeEl.textContent = formatTime(curTime);
  durationEl.textContent = formatTime(audio.duration || 0);
});

audio.addEventListener('ended', () => nextBtn.click());

playBtn.onclick = () => {
  if (audio.paused) {
    audio.play().catch(e => alert('播放失败：' + e.message));
    playBtn.innerHTML = '<i class="fas fa-pause"></i>';
  } else {
    audio.pause();
    playBtn.innerHTML = '<i class="fas fa-play"></i>';
  }
};

prevBtn.onclick = () => {
  currentIndex = currentIndex <= 0 ? playlist.length - 1 : currentIndex - 1;
  playCurrent();
};

nextBtn.onclick = () => {
  currentIndex = (currentIndex + 1) % playlist.length;
  playCurrent();
};

progressBar.addEventListener('click', e => {
  const rect = progressBar.getBoundingClientRect();
  const percent = (e.clientX - rect.left) / rect.width;
  audio.currentTime = percent * audio.duration;
});

volumeSlider.oninput = () => {
  audio.volume = volumeSlider.value / 100;
  localStorage.setItem('volume', volumeSlider.value);
};

// ==================== 播放列表 ====================
function renderPlaylist() {
  playlistUl.innerHTML = '';
  playlist.forEach((song, i) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${song.name} - ${song.artist.join(' / ')}</span>`;
    li.onclick = (e) => {
      e.stopPropagation();
      currentIndex = i;
      playCurrent();
    };
    playlistUl.appendChild(li);
  });
}

function highlightPlaylist() {
  document.querySelectorAll('#playlistUl li').forEach((li, i) => {
    li.classList.toggle('playing', i === currentIndex);
  });
}

function savePlaylist() {
  localStorage.setItem('playlist', JSON.stringify(playlist));
}

playlistBtn.onclick = () => playlistPanel.classList.add('show');
closePlaylist.onclick = () => playlistPanel.classList.remove('show');
clearPlaylist.onclick = () => {
  if (confirm('清空播放列表？')) {
    playlist = [];
    currentIndex = 0;
    savePlaylist();
    renderPlaylist();
    audio.pause();
    audio.src = '';
    titleEl.textContent = '未播放';
    artistEl.textContent = '';
    coverEl.src = 'https://via.placeholder.com/60';
    playBtn.innerHTML = '<i class="fas fa-play"></i>';
  }
};

document.addEventListener('click', e => {
  if (!e.target.closest('#playlist') && !e.target.closest('#playlistBtn')) {
    playlistPanel.classList.remove('show');
  }
});

// ==================== 工具函数 ====================
function formatTime(seconds) {
  const mins = Math.floor(seconds / 60).toString().padStart(2, '0');
  const secs = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${mins}:${secs}`;
}
