// ==================== 全局变量 ====================
const API_BASE = "https://music-api.gdstudio.xyz/api.php";
let playlist = JSON.parse(localStorage.getItem('playlist') || '[]'); // 持久化播放列表
let currentIndex = parseInt(localStorage.getItem('currentIndex') || '0');
let lyricLines = [];
let audio = document.getElementById('audio');

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
renderPlaylist(); // 加载上次播放列表
if (playlist.length > 0 && currentIndex < playlist.length) playCurrent(); // 恢复播放

// ==================== 搜索功能 ====================
searchBtn.onclick = () => search();
searchInput.addEventListener('keydown', e => e.key === 'Enter' && search());

async function search(page = 1) {
  const keyword = searchInput.value.trim();
  if (!keyword) return alert('请输入关键词');
  
  results.innerHTML = '<div class="loading">搜索中...</div>'; // 骨架屏
  const source = sourceSelect.value;
  const url = `${API_BASE}?types=search&source=${source}&name=${encodeURIComponent(keyword)}&count=30&pages=${page}`;
  
  try {
    const res = await fetch(url);
    const data = await res.json();
    
    results.innerHTML = '';
    if (data.length === 0) {
      results.innerHTML = '<p>未找到结果，试试换个关键词或音乐源</p>';
      return;
    }
    
    data.forEach((song, idx) => {
      const div = document.createElement('div');
      div.className = 'song-item';
      const picUrl = song.pic_id ? `${API_BASE}?types=pic&source=${source}&id=${song.pic_id}&size=300` : 'https://via.placeholder.com/60?text=No+Cover';
      div.innerHTML = `
        <img src="${picUrl}" onerror="this.src='https://via.placeholder.com/60?text=Error'" alt="cover">
        <div class="info">
          <h4>${song.name}</h4>
          <p>${song.artist.join(' / ')} - ${song.album}</p>
        </div>
      `;
      // 双击加入列表，单击播放
      div.ondblclick = () => addToPlaylist(song, false); // 只加不播
      div.onclick = (e) => { if (e.detail === 1) addToPlaylistAndPlay(song); };
      results.appendChild(div);
    });
  } catch (e) {
    results.innerHTML = '<p style="color:red">搜索失败，请检查网络或换源</p>';
    console.error(e);
  }
}

// ==================== 播放控制 ====================
function addToPlaylist(song, playNow = true) {
  // 去重检查
  const existIdx = playlist.findIndex(s => s.id === song.id && s.source === song.source);
  if (existIdx !== -1) {
    if (playNow) currentIndex = existIdx;
  } else {
    song.source = song.source || sourceSelect.value; // 确保 source
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
  const picUrl = song.pic_id ? `${API_BASE}?types=pic&source=${song.source}&id=${song.pic_id}&size=500` : 'https://via.placeholder.com/60?text=No+Cover';
  coverEl.src = picUrl;

  // 获取播放 URL（优先无损，降级到 320k）
  try {
    let br = 999;
    let urlData;
    while (br >= 128) {
      const urlRes = await fetch(`${API_BASE}?types=url&source=${song.source}&id=${song.id}&br=${br}`);
      urlData = await urlRes.json();
      if (urlData.url) break;
      br -= 128; // 降级
    }
    if (!urlData.url) throw new Error('无可用链接');
    audio.src = urlData.url;
    audio.play();
    playBtn.innerHTML = '<i class="fas fa-pause"></i>';
  } catch (e) {
    alert('加载歌曲失败：' + e.message);
    return;
  }

  // 加载歌词
  fetchLyric(song);
  highlightPlaylist();
  localStorage.setItem('currentIndex', currentIndex);
}

function fetchLyric(song) {
  lyricContainer.classList.remove('show');
  lyricContainer.innerHTML = '<div>加载歌词中...</div>';
  const lyricId = song.lyric_id || song.id;
  fetch(`${API_BASE}?types=lyric&source=${song.source}&id=${lyricId}`)
    .then(res => res.json())
    .then(data => {
      const lrc = data.lyric || '';
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

// LRC 解析函数（带时间戳）
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
  // 歌词高亮
  const activeLine = lyricLines.find((line, idx) => 
    line.time <= curTime && (!lyricLines[idx + 1] || lyricLines[idx + 1].time > curTime)
  );
  if (activeLine) {
    lyricContainer.innerHTML = `<div>${activeLine.text}</div>`;
    lyricContainer.classList.add('show');
  }

  // 进度条
  const percent = audio.duration ? (curTime / audio.duration) * 100 : 0;
  progressFill.style.width = percent + '%';
  currentTimeEl.textContent = formatTime(curTime);
  durationEl.textContent = formatTime(audio.duration || 0);
});

audio.addEventListener('ended', () => nextBtn.click()); // 自动下一首

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

// 进度条拖拽
progressBar.addEventListener('click', e => {
  const rect = progressBar.getBoundingClientRect();
  const percent = (e.clientX - rect.left) / rect.width;
  audio.currentTime = percent * audio.duration;
});

// 音量控制
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

// 点击外部关闭侧边栏
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
