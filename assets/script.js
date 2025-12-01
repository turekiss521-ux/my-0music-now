// ==================== 全局变量 ====================
const APIS = {
  main: "https://music-api.gdstudio.xyz/api.php",  // 主API
  backup: "https://music.cyrilstudio.top"  // 唯一备选（兼容原格式，避免uomg兼容问题）
};
let playlist = JSON.parse(localStorage.getItem('playlist') || '[]');
let currentIndex = parseInt(localStorage.getItem('currentIndex') || '0');
let lyricLines = [];
const RATE_LIMIT_KEY = 'search_requests';
const RATE_LIMIT_WINDOW = 5 * 60 * 1000;
const RATE_LIMIT_MAX = 60;

// ==================== DOM & 初始化（用DOMContentLoaded确保ready） ====================
document.addEventListener('DOMContentLoaded', () => {
  const $ = id => document.getElementById(id);
  const audio = $('audio');
  const volumeSlider = $('volumeSlider');
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
  const playlistUl = $('playlistUl');
  const playlistPanel = $('playlist');
  const closePlaylist = $('closePlaylist');
  const clearPlaylist = $('clearPlaylist');
  const lyricContainer = $('lyricContainer');
  const progressBar = document.querySelector('.progress-bar');
  const playlistBtn = $('playlistBtn');

  // 音量初始化
  if (volumeSlider) {
    volumeSlider.value = localStorage.getItem('volume') || 80;
    if (audio) audio.volume = volumeSlider.value / 100;
  }

  renderPlaylist(playlistUl);
  if (playlist.length > 0 && currentIndex < playlist.length) playCurrent(audio, titleEl, artistEl, coverEl, playBtn, lyricContainer);

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

  // ==================== API调用（简化，只2个源） ====================
  async function apiFetch(params, type = 'search') {
    const apis = [APIS.main, APIS.backup];
    for (let api of apis) {
      try {
        const url = `${api}?${new URLSearchParams({ ...params, types: type }).toString()}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (data && (type === 'search' ? data.length > 0 : data.url)) {
          console.log(`API success (${type}): ${api}`);
          return data;
        }
      } catch (e) {
        console.warn(`API ${api} failed (${type}):`, e.message);
      }
    }
    throw new Error('All APIs failed - try refresh');
  }

  // ==================== 搜索 ====================
  searchBtn.onclick = () => search();
  searchInput.addEventListener('keydown', e => e.key === 'Enter' && search());

  async function search() {
    if (!checkRateLimit()) return;
    const keyword = searchInput.value.trim();
    if (!keyword) return alert('请输入关键词');
    results.innerHTML = '<p>搜索中...</p>';
    const source = sourceSelect.value || 'kuwo';
    try {
      const data = await apiFetch({ source, name: keyword, count: 20 });
      results.innerHTML = '';
      if (data.length === 0) return results.innerHTML = '<p>无结果，换关键词试试</p>';
      data.forEach(song => {
        const div = document.createElement('div');
        div.className = 'song-item';
        const picUrl = song.pic_id ? `${APIS.main}?types=pic&source=${source}&id=${song.pic_id}&size=300` : 'https://via.placeholder.com/60';
        div.innerHTML = `
          <img src="${picUrl}" onerror="this.src='https://via.placeholder.com/60?text=?" alt="cover">
          <div class="info"><h4>${song.name}</h4><p>${song.artist.join(' / ')} - ${song.album}</p></div>
        `;
        div.onclick = () => addToPlaylistAndPlay(song, audio, titleEl, artistEl, coverEl, playBtn, lyricContainer);
        results.appendChild(div);
      });
    } catch (e) {
      results.innerHTML = `<p style="color:red">搜索失败: ${e.message}</p>`;
    }
  }

  // ==================== 播放 ====================
  function addToPlaylistAndPlay(song, audio, titleEl, artistEl, coverEl, playBtn, lyricContainer) {
    const exist = playlist.findIndex(s => s.id === song.id);
    if (exist !== -1) currentIndex = exist;
    else {
      playlist.push(song);
      currentIndex = playlist.length - 1;
    }
    savePlaylist(playlist);
    renderPlaylist(playlistUl);
    playCurrent(audio, titleEl, artistEl, coverEl, playBtn, lyricContainer);
  }

  async function playCurrent(audio, titleEl, artistEl, coverEl, playBtn, lyricContainer) {
    const song = playlist[currentIndex];
    if (!song) return;
    titleEl.textContent = song.name;
    artistEl.textContent = song.artist.join(' / ');
    coverEl.src = song.pic_id ? `${APIS.main}?types=pic&source=${song.source || 'kuwo'}&id=${song.pic_id}&size=500` : 'https://via.placeholder.com/60';

    // URL降级
    let url = null;
    const brs = [320, 128];  // 优先320，避免999不稳
    for (let br of brs) {
      try {
        const data = await apiFetch({ source: song.source || 'kuwo', id: song.id, br });
        if (data.url && data.url.includes('.mp3')) {
          url = data.url;
          console.log('Play URL:', url);
          break;
        }
      } catch (e) {
        console.warn('URL try failed:', e);
      }
    }
    if (!url) return alert('歌曲源失效，换一首试试');
    audio.src = url;
    audio.play().catch(e => alert('播放错误: ' + e.message));
    playBtn.innerHTML = '<i class="fas fa-pause"></i>';

    // 歌词
    try {
      const lrcData = await apiFetch({ source: song.source || 'kuwo', id: song.id }, 'lyric');
      lyricLines = parseLrc(lrcData.lyric || '');
    } catch (e) { console.warn('Lyric failed'); }
    highlightPlaylist(playlistUl, currentIndex);
    localStorage.setItem('currentIndex', currentIndex);
  }

  // 其他事件（简化）
  playBtn.onclick = () => {
    if (audio.paused) {
      audio.play();
      playBtn.innerHTML = '<i class="fas fa-pause"></i>';
    } else {
      audio.pause();
      playBtn.innerHTML = '<i class="fas fa-play"></i>';
    }
  };
  prevBtn.onclick = () => { currentIndex = (currentIndex - 1 + playlist.length) % playlist.length; playCurrent(...); };
  nextBtn.onclick = () => { currentIndex = (currentIndex + 1) % playlist.length; playCurrent(...); };
  progressBar.onclick = e => { if (audio.duration) audio.currentTime = (e.offsetX / progressBar.offsetWidth) * audio.duration; };
  volumeSlider.oninput = () => { audio.volume = volumeSlider.value / 100; localStorage.setItem('volume', volumeSlider.value); };
  audio.ontimeupdate = () => {
    const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
    progressFill.style.width = pct + '%';
    currentTimeEl.textContent = formatTime(audio.currentTime);
    durationEl.textContent = formatTime(audio.duration);
    // 歌词
    const line = lyricLines.find(l => l.time <= audio.currentTime && (!lyricLines[lyricLines.indexOf(l)+1] || lyricLines[lyricLines.indexOf(l)+1].time > audio.currentTime));
    if (line && lyricContainer) {
      lyricContainer.innerHTML = `<div>${line.text}</div>`;
      lyricContainer.classList.add('show');
    }
  };
  audio.onended = () => nextBtn.click();
  playlistBtn.onclick = () => playlistPanel.classList.add('show');
  closePlaylist.onclick = () => playlistPanel.classList.remove('show');
  clearPlaylist.onclick = () => { if (confirm('清空?')) { playlist = []; currentIndex = 0; savePlaylist(playlist); renderPlaylist(playlistUl); audio.pause(); titleEl.textContent = '未播放'; } };
  document.onclick = e => { if (!e.target.closest('#playlist')) playlistPanel.classList.remove('show'); };

  function renderPlaylist(ul) { ul.innerHTML = ''; playlist.forEach((s, i) => { const li = document.createElement('li'); li.textContent = `${s.name} - ${s.artist.join('/')}`; li.onclick = () => { currentIndex = i; playCurrent(...); }; ul.appendChild(li); }); }
  function highlightPlaylist(ul, idx) { ul.querySelectorAll('li').forEach((li, i) => li.classList.toggle('playing', i === idx)); }
  function savePlaylist(pl) { localStorage.setItem('playlist', JSON.stringify(pl)); }
  function parseLrc(lrc) { /* LRC解析简化版 */ const lines = lrc.split('\n'); return lines.map(line => { const m = line.match(/\[(\d{2}):(\d{2})\.(\d{2})\](.*)/); if (m) return { time: parseInt(m[1])*60 + parseInt(m[2]) + parseInt(m[3])/100, text: m[4].trim() }; }).filter(l => l); }
  function formatTime(s) { return `${Math.floor(s/60).toString().padStart(2,'0')}:${Math.floor(s%60).toString().padStart(2,'0')}`; }
});
