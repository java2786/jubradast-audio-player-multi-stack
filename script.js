let youtubePlayer = null;
let youtubePlayerReady = false;
let pendingSongId = null;
let playbackInterval = null;
let isPlaybackActive = false;
let currentSongIndex = 0;

toggleElement("main-player");
function toggleElement(id) {
    const el = document.getElementById(id);
    if (!el) return;

    if (el.style.opacity === "0" || el.style.visibility === "hidden") {
        el.style.opacity = "1";
        el.style.visibility = "visible";
        el.style.pointerEvents = "auto";
    } else {
        el.style.opacity = "0";
        el.style.visibility = "hidden";
        el.style.pointerEvents = "none";
    }
}

// Post a command message to the YouTube iframe
function myAction(id, action, args = []) {
    const iframe = document.getElementById(id);
    if (iframe && iframe.contentWindow) {
        try {
            iframe.contentWindow.postMessage(JSON.stringify({
                event: "command",
                func: action,
                args: args
            }), "*");
        } catch (error) {
            console.error("Failed to post message to player iframe:", error);
        }
    }
}

function playMusic(id) {
    myAction(id, "playVideo");
}

function pauseMusic(id) {
    myAction(id, "pauseVideo");
}

function togglePlayback() {
    if (isPlaybackActive) {
        setPlaybackActive(false);
        stopPlaybackUpdates();
        if (youtubePlayerReady && youtubePlayer && typeof youtubePlayer.pauseVideo === "function") {
            try {
                youtubePlayer.pauseVideo();
            } catch (err) {
                console.warn("Error pausing via YouTube Player API:", err);
                pauseMusic("main-player");
            }
        } else {
            pauseMusic("main-player");
        }
    } else {
        // If a song is selected/default and player has not started playback yet
        if (currentSongIndex >= 0 && typeof songs !== "undefined" && Array.isArray(songs) && songs[currentSongIndex]) {
            const currentSong = songs[currentSongIndex];
            let playerState = -1;
            if (youtubePlayer && typeof youtubePlayer.getPlayerState === "function") {
                try {
                    playerState = youtubePlayer.getPlayerState();
                } catch (e) {}
            }
            // If player is not ready or has an unstarted/cued video, initiate playback of the selected track
            if (!youtubePlayerReady || playerState === -1 || playerState === 5) {
                playSong(currentSong.id, currentSong.title, currentSongIndex);
                return;
            }
        }

        setPlaybackActive(true);
        if (youtubePlayerReady && youtubePlayer && typeof youtubePlayer.playVideo === "function") {
            try {
                youtubePlayer.playVideo();
            } catch (err) {
                console.warn("Error playing via YouTube Player API:", err);
                playMusic("main-player");
            }
        } else {
            playMusic("main-player");
        }
        stopPlaybackUpdates();
        playbackInterval = window.setInterval(updatePlaybackTimeline, 500);
    }
}

function setPlaybackActive(active) {
    isPlaybackActive = Boolean(active);
    const button = document.getElementById("playback-toggle");
    const icon = document.getElementById("playback-icon");
    const label = document.getElementById("playback-label");

    if (icon) {
        icon.innerHTML = isPlaybackActive ? "&#9208;" : "&#9654;";
    }
    if (label) {
        label.textContent = isPlaybackActive ? "Pause" : "Play";
    }
    if (button) {
        button.setAttribute("aria-label", isPlaybackActive ? "Pause" : "Play");
    }
}

function formatPlaybackTime(seconds) {
    const safeSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
    const minutes = Math.floor(safeSeconds / 60);
    const remainingSeconds = safeSeconds % 60;
    return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function updatePlaybackTimeline() {
    if (!youtubePlayer) return;

    let currentTime = 0;
    let duration = 0;
    try {
        if (typeof youtubePlayer.getCurrentTime === "function") {
            currentTime = Number(youtubePlayer.getCurrentTime()) || 0;
        }
        if (typeof youtubePlayer.getDuration === "function") {
            duration = Number(youtubePlayer.getDuration()) || 0;
        }
    } catch (err) {
        return;
    }

    const hasDuration = Number.isFinite(duration) && duration > 0;
    const boundedTime = hasDuration ? Math.min(currentTime, duration) : currentTime;
    const currentLabel = formatPlaybackTime(boundedTime);
    const durationLabel = hasDuration ? formatPlaybackTime(duration) : "--:--";
    const progress = hasDuration ? Math.min((boundedTime / duration) * 100, 100) : 0;

    const currentTimeEl = document.getElementById("playback-current-time");
    const durationEl = document.getElementById("playback-duration");
    const progressFillEl = document.getElementById("playback-progress-fill");
    const progressBar = document.getElementById("playback-progress");

    if (currentTimeEl) {
        currentTimeEl.textContent = currentLabel;
    }
    if (durationEl) {
        durationEl.textContent = durationLabel;
    }
    if (progressFillEl) {
        progressFillEl.style.width = `${progress}%`;
    }
    if (progressBar) {
        progressBar.setAttribute("aria-valuenow", String(Math.round(progress)));
        progressBar.setAttribute(
            "aria-valuetext",
            hasDuration
                ? `Playback time ${currentLabel} of ${durationLabel}`
                : `Playback time ${currentLabel}; duration unavailable`
        );
    }
}

function stopPlaybackUpdates() {
    if (playbackInterval !== null) {
        window.clearInterval(playbackInterval);
        playbackInterval = null;
    }
}

function resetPlaybackTimeline() {
    stopPlaybackUpdates();

    const currentTimeEl = document.getElementById("playback-current-time");
    const durationEl = document.getElementById("playback-duration");
    const progressFillEl = document.getElementById("playback-progress-fill");
    const progressBar = document.getElementById("playback-progress");

    if (currentTimeEl) currentTimeEl.textContent = "0:00";
    if (durationEl) durationEl.textContent = "--:--";
    if (progressFillEl) progressFillEl.style.width = "0%";
    if (progressBar) {
        progressBar.setAttribute("aria-valuenow", "0");
        progressBar.setAttribute("aria-valuetext", "Playback time 0:00; duration unavailable");
    }
}

function onYouTubePlayerStateChange(event) {
    if (!event) return;

    const state = event.data;

    // YT.PlayerState constants check
    const isEnded = (typeof YT !== "undefined" && YT.PlayerState && state === YT.PlayerState.ENDED) || state === 0;
    const isPlaying = (typeof YT !== "undefined" && YT.PlayerState && state === YT.PlayerState.PLAYING) || state === 1;
    const isPaused = (typeof YT !== "undefined" && YT.PlayerState && state === YT.PlayerState.PAUSED) || state === 2;

    if (isEnded) {
        playNextSong();
        return;
    }

    if (isPlaying) {
        setPlaybackActive(true);
        updateActivePlaylistTrack();
        updatePlaybackTimeline();
        stopPlaybackUpdates();
        playbackInterval = window.setInterval(updatePlaybackTimeline, 500);
    } else if (isPaused) {
        setPlaybackActive(false);
        updateActivePlaylistTrack();
        stopPlaybackUpdates();
        updatePlaybackTimeline();
    }
    // Note: Buffering (3) ya Unstarted (-1) states ko ignore kiya hai taaki loading ke waqt gaana apne aap pause na ho
}

function onYouTubePlayerError(event) {
    const errorCode = event && event.data !== undefined ? event.data : "unknown";
    console.warn(`YouTube player error encountered (code: ${errorCode}).`);
    resetPlaybackTimeline();
    setPlaybackActive(false);
    updateActivePlaylistTrack();
}

function initializeYouTubePlayer() {
    if (typeof YT === "undefined" || !YT.Player) {
        console.error("YouTube IFrame API is unavailable.");
        return;
    }

    const defaultSong = (typeof songs !== "undefined" && Array.isArray(songs) && songs.length > 0)
        ? songs[0]
        : null;

    try {
        youtubePlayer = new YT.Player("main-player", {
            events: {
                onReady: function (event) {
                    youtubePlayerReady = true;
                    const player = (event && event.target) || youtubePlayer;
                    if (pendingSongId) {
                        try {
                            if (player && typeof player.loadVideoById === "function") {
                                player.loadVideoById(pendingSongId);
                            }
                            setPlaybackActive(true);
                            stopPlaybackUpdates();
                            playbackInterval = window.setInterval(updatePlaybackTimeline, 500);
                        } catch (err) {
                            console.warn("Failed to load pending song:", err);
                        }
                        pendingSongId = null;
                    } else if (defaultSong && defaultSong.id) {
                        // Associate the default song with the player without starting playback
                        try {
                            if (player && typeof player.cueVideoById === "function") {
                                player.cueVideoById(defaultSong.id);
                            }
                        } catch (err) {
                            console.warn("Failed to cue default song:", err);
                        }
                    }
                },
                onStateChange: onYouTubePlayerStateChange,
                onError: onYouTubePlayerError
            }
        });
    } catch (error) {
        console.error("Failed to initialize YouTube Player:", error);
    }
}

window.onYouTubeIframeAPIReady = initializeYouTubePlayer;

// Asynchronously load the YouTube IFrame Player API
const youtubeApiScript = document.createElement("script");
youtubeApiScript.src = "https://www.youtube.com/iframe_api";
youtubeApiScript.onerror = function () {
    console.error("Failed to load the YouTube IFrame API script.");
};
document.head.appendChild(youtubeApiScript);

function updateTrackStrip(song, title) {
    const titleEl = document.getElementById("track-strip-title");
    const artistEl = document.getElementById("track-strip-artist");
    const albumEl = document.getElementById("track-strip-album");
    const yearEl = document.getElementById("track-strip-year");

    if (titleEl) {
        titleEl.textContent = title || (song && song.title) || "Track details unavailable";
    }
    if (artistEl) {
        artistEl.textContent = song && song.artist ? song.artist : "Artist unavailable";
    }
    if (albumEl) {
        albumEl.textContent = song && song.album ? song.album : "Album unavailable";
    }
    if (yearEl) {
        yearEl.textContent = song && song.year !== undefined && song.year !== null && String(song.year).trim()
            ? String(song.year)
            : "Year unavailable";
    }
}

function updateInitialTrackDetails() {
    if (typeof songs !== "undefined" && Array.isArray(songs) && songs.length > 0) {
        const defaultSong = songs[0];
        currentSongIndex = 0;
        updateTrackStrip(defaultSong, defaultSong.title);
        const currentSongEl = document.getElementById("current-song");
        if (currentSongEl && defaultSong) {
            currentSongEl.textContent = defaultSong.title || "Unknown track";
        }
    }
}

function updateActivePlaylistTrack() {
    const songsList = document.getElementById("songs-list");
    if (!songsList) return;

    let playingVideoId = "";
    if (youtubePlayerReady && youtubePlayer && typeof youtubePlayer.getVideoData === "function") {
        try {
            const videoData = youtubePlayer.getVideoData();
            playingVideoId = (videoData && videoData.video_id) || "";
        } catch (err) {
            playingVideoId = "";
        }
    }

    const rows = songsList.querySelectorAll(".playlist-song");
    rows.forEach((row, index) => {
        let isSelectedOrActive = false;
        if (currentSongIndex >= 0) {
            isSelectedOrActive = (index === currentSongIndex);
        } else if (playingVideoId) {
            isSelectedOrActive = (row.dataset.videoId === playingVideoId);
        }
        row.classList.toggle("playlist-song-active", isSelectedOrActive);
        if (isSelectedOrActive) {
            row.setAttribute("aria-current", "true");
        } else {
            row.removeAttribute("aria-current");
        }
    });
}

function playSong(id, title, index) {
    if (!id || typeof id !== "string") {
        console.warn("Cannot play song: invalid or missing video ID.");
        return;
    }

    if (typeof index === "number" && index >= 0) {
        currentSongIndex = index;
    } else if (typeof songs !== "undefined" && Array.isArray(songs)) {
        const foundIndex = songs.findIndex(track => track.id === id);
        currentSongIndex = foundIndex !== -1 ? foundIndex : 0;
    }

    const song = (typeof songs !== "undefined" && Array.isArray(songs) && songs[currentSongIndex])
        ? songs[currentSongIndex]
        : ((typeof songs !== "undefined" && Array.isArray(songs)) ? songs.find(track => track.id === id) : null);

    const displayTitle = (song && song.title) || title || "Unknown track";

    // Update current song heading (#current-song)
    const currentSongEl = document.getElementById("current-song");
    if (currentSongEl) {
        currentSongEl.textContent = displayTitle;
    }

    // Update metadata strip
    updateTrackStrip(song, displayTitle);

    // Update active playlist song highlight
    updateActivePlaylistTrack();

    // Reset progress UI and set play state to active
    resetPlaybackTimeline();
    setPlaybackActive(true);

    // Smart Play Trigger
    if (youtubePlayerReady && youtubePlayer && typeof youtubePlayer.loadVideoById === "function") {
        try {
            youtubePlayer.loadVideoById(id);
            stopPlaybackUpdates();
            playbackInterval = window.setInterval(updatePlaybackTimeline, 500);
        } catch (err) {
            console.warn("Failed via YouTube API:", err);
            playMusic("main-player");
        }
    } else {
        pendingSongId = id;
        const iframe = document.getElementById("main-player");
        if (iframe) {
            iframe.src = `https://www.youtube.com/embed/${encodeURIComponent(id)}?autoplay=1&enablejsapi=1`;
        }
        stopPlaybackUpdates();
        playbackInterval = window.setInterval(updatePlaybackTimeline, 500);
    }
}

function playNextSong() {
    if (typeof songs === "undefined" || !Array.isArray(songs) || songs.length === 0) {
        console.warn("Cannot play next song: playlist is empty or unavailable.");
        resetPlaybackTimeline();
        return;
    }

    // Playlist looping using modulo (%)
    const nextIndex = (currentSongIndex + 1) % songs.length;
    currentSongIndex = nextIndex;
    const nextSong = songs[nextIndex];

    if (!nextSong || !nextSong.id) {
        console.warn("Cannot play next song: invalid track data at index", nextIndex);
        return;
    }

    playSong(nextSong.id, nextSong.title, nextIndex);
}

function changeSong() {
    playNextSong();
}

function isValidSong(song) {
    return Boolean(
        song &&
        typeof song === "object" &&
        typeof song.id === "string" &&
        song.id.trim()
    );
}

function renderPlaylist(songList) {
    const songsList = document.getElementById("songs-list");
    if (!songsList) {
        console.warn("Playlist element #songs-list not found in DOM.");
        return;
    }

    songsList.innerHTML = "";

    songList.forEach((song, index) => {
        if (!isValidSong(song)) {
            console.warn("Skipping invalid song entry at index", index, song);
            return;
        }

        const title = song.title || "Untitled track";
        const item = document.createElement("li");
        item.className = "playlist-song";
        item.dataset.videoId = song.id;

        const main = document.createElement("div");
        main.className = "song-main";

        const number = document.createElement("span");
        number.className = "song-number";
        number.textContent = String(index + 1).padStart(2, "0");
        number.setAttribute("aria-hidden", "true");

        const artwork = document.createElement("span");
        artwork.className = "song-artwork-placeholder";
        artwork.textContent = "♫";
        artwork.setAttribute("aria-hidden", "true");

        const titleButton = document.createElement("button");
        titleButton.className = "song-title";
        titleButton.type = "button";
        titleButton.textContent = title;
        titleButton.setAttribute("aria-label", `Play ${title}`);
        titleButton.addEventListener("click", () => playSong(song.id, title, index));

        const artist = document.createElement("span");
        artist.className = "song-artist";
        artist.textContent = song.artist || "Unknown artist";

        const details = document.createElement("div");
        details.className = "song-details";
        details.append(titleButton);

        const year = document.createElement("span");
        year.className = "song-year";
        year.textContent = Number.isInteger(song.year) ? String(song.year) : "—";
        year.setAttribute("aria-label", Number.isInteger(song.year) ? `Year ${song.year}` : "Year unavailable");

        const playButton = document.createElement("button");
        playButton.className = "song-play-button";
        playButton.type = "button";
        playButton.textContent = "▶";
        playButton.setAttribute("aria-label", `Play ${title}`);
        playButton.addEventListener("click", () => playSong(song.id, title, index));

        main.append(number, artwork, details);
        item.append(main, artist, year, playButton);
        songsList.append(item);
    });

    updateActivePlaylistTrack();
}

function initializeDefaultTrack() {
    if (typeof songs === "undefined" || !Array.isArray(songs) || songs.length === 0) {
        return;
    }

    const defaultSong = songs[0];
    currentSongIndex = 0;

    // Display title in the main song heading (#current-song)
    const currentSongEl = document.getElementById("current-song");
    if (currentSongEl && defaultSong) {
        currentSongEl.textContent = defaultSong.title || "Unknown track";
    }

    // Display details in the track-strip section
    if (defaultSong) {
        updateTrackStrip(defaultSong, defaultSong.title);
    }

    // Highlight the default song in the playlist
    updateActivePlaylistTrack();

    // Ensure playback timeline and controls are in initial stopped/play state
    resetPlaybackTimeline();
    setPlaybackActive(false);
}

window.togglePlayback = togglePlayback;
window.playSong = playSong;
window.playNextSong = playNextSong;
window.changeSong = changeSong;

document.addEventListener("DOMContentLoaded", () => {
    const changeBtn = document.getElementById("change-song");
    if (changeBtn) {
        changeBtn.addEventListener("click", changeSong);
    }
});

if (typeof songs !== "undefined" && Array.isArray(songs)) {
    renderPlaylist(songs);
    initializeDefaultTrack();
} else {
    console.warn("Songs collection is unavailable.");
}
