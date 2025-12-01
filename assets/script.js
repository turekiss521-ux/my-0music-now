// ==================== 全局变量 ====================
const API = "/api.php";  // 你的 Worker 主源，稳！
let playlist = JSON.parse(localStorage.getItem('playlist') || '[]');
let currentIndex = parseInt(localStorage.getItem('currentIndex') || '0');
let lyricLines = [];
const RATE_LIMIT_KEY = 'search_requests';
const RATE_LIMIT_WINDOW = 5 * 60 * 1000;
const RATE_LIMIT_MAX = 60;
const PLACEHOLDER_COVER = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMzAiIGZpbGw9IiMzMzMiLz4KPHRleHQgeD0iMzAiIHk9IjM1IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmaWxsPSIjOTk5IiBmb250LWZhbWlseT0iQXJpYWwiIGZvbnQtc2l6ZT0iMTIiPk5vIENvdmVyPC90ZXh0Pgo8L3N2Zz4K';

// ==================== DOM & 初始化 ====================
window.addEventListener('load', () => {
  const $ = id => document.getElementById(id);
  const audio = $('audio');
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
  const playlistBtn = $('playlistBtn');

  volumeSlider.value = localStorage.getItem('volume') || 80;
  audio.volume = volumeSlider.value / 100;

  renderPlaylist();
  if (playlist.length > 0 && currentIndex < playlist.length) playCurrent();

  // ==================== 限流 ====================
  function checkRateLimit() {
    let requests = JSON.parse(localStorage.getItem(RATE_LIMIT_KEY) || '[]');
    const now = Date.now();
    requests = requests.filter(time => now - time < RATE_LIMIT_WINDOW);
    if (requests.length >= RATE_LIMIT_MAX) {
      const waitTime = Math.ceil((RATE_LIMIT_WINDOW - (now - requests[0])) / 1000 / 60);
      alert(`请求过多，5分钟内最多60次搜索。请${waitTime}分钟后重试。`);
      searchBtn.disabled = true;
      setTimeout(() => searchBtn.disabled = false, RATE_LIMIT_WINDOW - (now - requests[0]));
      return false;
    }
    requests.push(now);
    localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(requests));
    return true;
  }

  // ==================== API 调用（单源版，借鉴 GD 原创） ====================
  async function apiFetch(params, type = 'search') {
    try {
      const url = `${API}?${new URLSearchParams({ ...params, types: type }).toString()}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      
      // 验证数据（借鉴 GD）
      if (type === 'search' && Array.isArray(data) && data.length > 0) {
        console.log('搜索成功！', data.length, '首歌');
        return data;
      }
      if (type === 'url' && data.url && data.url.includes('.mp3')) {
        console.log('链接成功！音质:', data.br);
        return data;
      }
      if (type === 'lyric' && data.lyric) {
        console.log('歌词成功！');
        return data;
      }
      if (type === 'pic' && data.url) {
        console.log('封面成功！');
        return data;
      }
      
      throw new Error('数据无效');
    } catch (e) {
      console.warn('API 失败:', e.message);
      throw e;
    }
  }

  // ==================== 搜索 ====================
  searchBtn.onclick = () => search();
  searchInput.addEventListener('keydown', e => e.key === 'Enter' && search());

  async function search() {
    if (!checkRateLimit()) return;
    const keyword = searchInput.value.trim();
    if (!keyword) return alert('请输入关键词');
    results.innerHTML = '<p>搜索中...</p>';
    const source = sourceSelect.value;
    try {
      const data = await apiFetch({ source, name: keyword, count: 20 }, 'search');
      results.innerHTML = '';
      if (data.length === 0) return results.innerHTML = '<p>无结果，换关键词试试</p>';
      data.forEach(song => {
        const div = document.createElement('div');
        div.className = 'song-item';
        const picUrl = song.pic_id ? `${API}?types=pic&source=${source}&id=${song.pic_id}&size=300` : PLACEHOLDER_COVER;
        div.innerHTML = `
          <img src="${picUrl}" onerror="this.src='${PLACEHOLDER_COVER}'" alt="cover">
          <div class="info"><h4>${song.name}</h4><p>${song.artist.join(' / ')} - ${song.album}</p></div>
        `;
        div.onclick = () => addToPlaylistAndPlay(song);
        results.appendChild(div);
      });
    } catch (e) {
      results.innerHTML = `<p style="color:red">搜索失败: ${e.message}</p>`;
    }
  }

  // ==================== 播放 ====================
  function addToPlaylistAndPlay(song) {
    const exist = playlist.findIndex(s => s.id === song.id);
    if (exist !== -1) currentIndex = exist;
    else {
      song.source = sourceSelect.value;
      playlist.push(song);
      currentIndex = playlist.length - 1;
    }
    localStorage.setItem('playlist', JSON.stringify(playlist));
    renderPlaylist();
    playCurrent();
  }

  async function playCurrent() {
    const song = playlist[currentIndex];
    if (!song) return;
    titleEl.textContent = song.name;
    artistEl.textContent = song.artist.join(' / ');
    const source = song.source || 'kuwo';

    // 封面
    const picUrl = song.pic_id ? `${API}?types=pic&source=${source}&id=${song.pic_id}&size=500` : PLACEHOLDER_COVER;
    coverEl.src = picUrl;
    coverEl.onerror = () => { coverEl.src = PLACEHOLDER_COVER; };

    try {
      let data;
      let br = 320;
      // 先试 320k
      data = await apiFetch({ source, id: song.id, br }, 'url');
      if (!data.url || !data.url.includes('.mp3')) {
        console.log('320k 失败，降级 128k...');
        br = 128;
        data = await apiFetch({ source, id: song.id, br }, 'url');
      }

      if (!data.url || !data.url.includes('.mp3')) {
        throw new Error('无可用音频链接');
      }

      audio.src = data.url;
      audio.load();
      await audio.play();
      playBtn.innerHTML = '<i class="fas fa-pause"></i>';
      console.log('🎵 播放成功！', song.name, '音质:', data.br + 'k');

      // 歌词
      try {
        const lrcData = await apiFetch({ source, id: song.lyric_id || song.id }, 'lyric');
        lyricLines = parseLrc(lrcData.lyric || '');
      } catch (e) { console.warn('歌词失败:', e.message); }

      highlightPlaylist();
      localStorage.setItem('currentIndex', currentIndex);
    } catch (e) {
      alert('播放失败：' + e.message + '\n建议：换源试试');
    }
  }

  // 事件监听（保持原）
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
    currentIndex = (currentIndex - 1 + playlist.length) % playlist.length;
    playCurrent();
  };
  nextBtn.onclick = () => {
    currentIndex = (currentIndex + 1) % playlist.length;
    playCurrent();
  };
  progressBar.onclick = e => {
    if (audio.duration) audio.currentTime = (e.offsetX / progressBar.offsetWidth) * audio.duration;
  };
  volumeSlider.oninput = () => {
    audio.volume = volumeSlider.value / 100;
    localStorage.setItem('volume', volumeSlider.value);
  };
  audio.ontimeupdate = () => {
    const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
    progressFill.style.width = pct + '%';
    currentTimeEl.textContent = formatTime(audio.currentTime);
    durationEl.textContent = formatTime(audio.duration);
    const line = lyricLines.find((l, i) => l.time <= audio.currentTime && lyricLines[i + 1]?.time > audio.currentTime);
    if (line && lyricContainer) {
      lyricContainer.innerHTML = `<div>${line.text}</div>`;
      lyricContainer.classList.add('show');
    }
  };
  audio.onended = () => nextBtn.click();
  playlistBtn.onclick = () => playlistPanel.classList.add('show');
  closePlaylist.onclick = () => playlistPanel.classList.remove('show');
  clearPlaylist.onclick = () => {
    if (confirm('清空播放列表？')) {
      playlist = [];
      currentIndex = 0;
      localStorage.setItem('playlist', JSON.stringify(playlist));
      renderPlaylist();
      audio.pause();
      audio.src = '';
      titleEl.textContent = '未播放';
      playBtn.innerHTML = '<i class="fas fa-play"></i>';
    }
  };
  document.onclick = e => {
    if (!e.target.closest('#playlist') && !e.target.closest('#playlistBtn')) playlistPanel.classList.remove('show');
  };

  function renderPlaylist() {
    playlistUl.innerHTML = '';
    playlist.forEach((s, i) => {
      const li = document.createElement('li');
      li.textContent = `${s.name} - ${s.artist.join(' / ')}`;
      li.onclick = () => {
        currentIndex = i;
        playCurrent();
      };
      playlistUl.appendChild(li);
    });
  }
  function highlightPlaylist() {
    playlistUl.querySelectorAll('li').forEach((li, i) => li.classList.toggle('playing', i === currentIndex));
  }
  function parseLrc(lrc) {
    return lrc.split('\n').map(line => {
      const m = line.match(/\[(\d{2}):(\d{2})\.(\d{2})\](.*)/);
      if (m) return { time: parseInt(m[1]) * 60 + parseInt(m[2]) + parseInt(m[3]) / 100, text: m[4].trim() };
    }).filter(l => l);
  }
  function formatTime(s) {
    return `${Math.floor(s / 60).toString().padStart(2, '0')}:${Math.floor(s % 60).toString().padStart(2, '0')}`;
  }
});
