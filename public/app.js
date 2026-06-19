/**
 * CineMatch — Movie Recommendation Engine
 * Loads pre-computed similarity data and provides instant recommendations.
 */

(function () {
    "use strict";

    // ─── State ──────────────────────────────────────────
    let movies = [];
    let similarity = {};
    let activeIndex = -1;
    let selectedMovie = null;

    // ─── DOM Elements ───────────────────────────────────
    const $ = (sel) => document.querySelector(sel);
    const loadingScreen = $("#loading-screen");
    const loaderBarFill = $(".loader-bar-fill");
    const app = $("#app");
    const searchInput = $("#search-input");
    const clearBtn = $("#clear-btn");
    const autocompleteList = $("#autocomplete-list");
    const heroSection = $("#hero-section");
    const resultsSection = $("#results-section");
    const selectedMovieName = $("#selected-movie-name");
    const selectedCardWrapper = $("#selected-card-wrapper");
    const resultsGrid = $("#results-grid");
    const picksList = $("#picks-list");
    const logoBtn = $("#logo-btn");

    // ─── TMDB Poster Helper ─────────────────────────────
    const TMDB_IMG = "https://image.tmdb.org/t/p/w500";
    const TMDB_API_BASE = "https://api.themoviedb.org/3";

    // Poster cache
    const posterCache = {};

    function getPosterUrl(tmdbId) {
        // Use TMDB placeholder via their public image CDN
        // We'll try to use the ID-based approach
        return null; // Will use placeholder; posters fetched lazily
    }

    function createPosterPlaceholder(title) {
        const emojis = ["🎬", "🎥", "🎞️", "🍿", "🎭", "📽️", "🌟", "🎪"];
        const emoji = emojis[Math.abs(hashStr(title)) % emojis.length];
        return `<div class="poster-placeholder">${emoji}</div>`;
    }

    function hashStr(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
        }
        return hash;
    }

    // Generate a unique gradient based on title for visual variety
    function getGradient(title) {
        const h = Math.abs(hashStr(title));
        const hue1 = h % 360;
        const hue2 = (hue1 + 40 + (h % 60)) % 360;
        return `linear-gradient(135deg, hsl(${hue1}, 60%, 25%) 0%, hsl(${hue2}, 50%, 15%) 100%)`;
    }

    // ─── Data Loading ───────────────────────────────────
    async function loadData() {
        try {
            loaderBarFill.style.width = "20%";

            const [moviesRes, simRes] = await Promise.all([
                fetch("data/movies.json"),
                fetch("data/similarity.json"),
            ]);

            loaderBarFill.style.width = "60%";

            movies = await moviesRes.json();
            loaderBarFill.style.width = "80%";

            similarity = await simRes.json();
            loaderBarFill.style.width = "100%";

            // Build title index for fast search
            buildSearchIndex();

            // Show app
            setTimeout(() => {
                loadingScreen.classList.add("fade-out");
                app.classList.remove("hidden");
                renderPopularPicks();
                searchInput.focus();
            }, 400);
        } catch (err) {
            console.error("Failed to load data:", err);
            $(".loader-text").textContent = "Error loading data. Please refresh.";
            $(".loader-text").style.color = "#ff6b6b";
        }
    }

    // ─── Search Index ───────────────────────────────────
    let searchEntries = [];

    function buildSearchIndex() {
        searchEntries = movies.map((m, i) => ({
            idx: i,
            titleLower: m.title.toLowerCase(),
            title: m.title,
            genres: m.genres || [],
            vote: m.vote || 0,
        }));
    }

    function searchMovies(query) {
        if (!query || query.length < 1) return [];
        const q = query.toLowerCase();

        // Score-based search
        const results = [];
        for (const entry of searchEntries) {
            const idx = entry.titleLower.indexOf(q);
            if (idx !== -1) {
                // Prioritize: starts-with > contains, shorter titles first
                const score = idx === 0 ? 1000 - entry.titleLower.length : 500 - entry.titleLower.length;
                results.push({ ...entry, score });
            }
        }

        results.sort((a, b) => b.score - a.score);
        return results.slice(0, 10);
    }

    // ─── Autocomplete Rendering ─────────────────────────
    function renderAutocomplete(results, query) {
        if (results.length === 0) {
            autocompleteList.classList.add("hidden");
            return;
        }

        const q = query.toLowerCase();
        autocompleteList.innerHTML = results
            .map((r, i) => {
                const movie = movies[r.idx];
                const title = movie.title;
                // Highlight match
                const matchIdx = title.toLowerCase().indexOf(q);
                let highlighted = title;
                if (matchIdx !== -1) {
                    highlighted =
                        escapeHtml(title.slice(0, matchIdx)) +
                        "<mark>" +
                        escapeHtml(title.slice(matchIdx, matchIdx + query.length)) +
                        "</mark>" +
                        escapeHtml(title.slice(matchIdx + query.length));
                }

                const genres = (movie.genres || []).slice(0, 3).join(", ") || "—";
                const vote = movie.vote ? movie.vote.toFixed(1) : "—";

                return `
                    <div class="autocomplete-item" data-index="${r.idx}" data-pos="${i}">
                        <div class="ac-icon" style="background: ${getGradient(title)}">🎬</div>
                        <div class="ac-info">
                            <div class="ac-title">${highlighted}</div>
                            <div class="ac-genres">${escapeHtml(genres)}</div>
                        </div>
                        <div class="ac-vote">⭐ ${vote}</div>
                    </div>
                `;
            })
            .join("");

        activeIndex = -1;
        autocompleteList.classList.remove("hidden");

        // Add click handlers
        autocompleteList.querySelectorAll(".autocomplete-item").forEach((item) => {
            item.addEventListener("click", () => {
                const idx = parseInt(item.dataset.index);
                selectMovie(idx);
            });
        });
    }

    function escapeHtml(str) {
        const div = document.createElement("div");
        div.textContent = str;
        return div.innerHTML;
    }

    // ─── Movie Selection ────────────────────────────────
    function selectMovie(movieIdx) {
        const movie = movies[movieIdx];
        if (!movie) return;

        selectedMovie = movie;
        searchInput.value = movie.title;
        autocompleteList.classList.add("hidden");
        clearBtn.classList.remove("hidden");

        // Get recommendations
        const simData = similarity[String(movieIdx)];
        if (!simData || simData.length === 0) {
            resultsGrid.innerHTML = '<p style="color: var(--text-muted); text-align: center; grid-column: 1/-1;">No recommendations found for this movie.</p>';
            showResults(movie);
            return;
        }

        const recommendations = simData.map((s) => ({
            movie: movies[s.p],
            score: s.s,
            pos: s.p,
        }));

        showResults(movie);
        renderRecommendations(recommendations);

        // Scroll to results
        setTimeout(() => {
            resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 100);
    }

    function showResults(movie) {
        selectedMovieName.textContent = movie.title;

        // Render selected movie card
        const vote = movie.vote ? movie.vote.toFixed(1) : "—";
        const genres = movie.genres || [];
        const overview = movie.overview || "No overview available.";

        selectedCardWrapper.innerHTML = `
            <div class="selected-card">
                <div class="selected-card-content">
                    <div class="selected-poster" style="background: ${getGradient(movie.title)}">
                        ${createPosterPlaceholder(movie.title)}
                    </div>
                    <div class="selected-info">
                        <h4>${escapeHtml(movie.title)}</h4>
                        <div class="selected-meta">
                            <div class="meta-vote">⭐ ${vote}</div>
                            <div class="genre-tags">
                                ${genres.map((g) => `<span class="genre-tag">${escapeHtml(g)}</span>`).join("")}
                            </div>
                        </div>
                        <p class="selected-overview">${escapeHtml(overview)}</p>
                    </div>
                </div>
            </div>
        `;

        resultsSection.classList.remove("hidden");
    }

    function renderRecommendations(recs) {
        resultsGrid.innerHTML = recs
            .map((r, i) => {
                const movie = r.movie;
                if (!movie) return "";
                const vote = movie.vote ? movie.vote.toFixed(1) : "—";
                const matchPct = Math.round(r.score * 100);
                const genres = (movie.genres || []).slice(0, 2);
                const overview = movie.overview || "";

                return `
                    <div class="movie-card" style="animation-delay: ${i * 0.06}s" data-pos="${r.pos}">
                        <div class="card-poster" style="background: ${getGradient(movie.title)}">
                            ${createPosterPlaceholder(movie.title)}
                            <div class="card-rank">#${i + 1}</div>
                            <div class="card-match">${matchPct}% match</div>
                        </div>
                        <div class="card-body">
                            <div class="card-title" title="${escapeHtml(movie.title)}">${escapeHtml(movie.title)}</div>
                            <div class="card-genres">
                                ${genres.map((g) => `<span class="card-genre">${escapeHtml(g)}</span>`).join("")}
                            </div>
                            <p class="card-overview">${escapeHtml(overview)}</p>
                        </div>
                        <div class="card-footer">
                            <div class="card-vote">⭐ ${vote}</div>
                            <span class="card-action">Find similar →</span>
                        </div>
                    </div>
                `;
            })
            .join("");

        // Click on recommendation card to search for that movie
        resultsGrid.querySelectorAll(".movie-card").forEach((card) => {
            card.addEventListener("click", () => {
                const pos = parseInt(card.dataset.pos);
                selectMovie(pos);
                window.scrollTo({ top: 0, behavior: "smooth" });
            });
        });
    }

    // ─── Popular Picks ──────────────────────────────────
    function renderPopularPicks() {
        const popular = [
            "Inception",
            "The Dark Knight",
            "Avatar",
            "Interstellar",
            "The Avengers",
            "Titanic",
            "Pulp Fiction",
            "The Matrix",
        ];

        picksList.innerHTML = popular
            .map((title) => {
                const movieIdx = searchEntries.findIndex(
                    (e) => e.titleLower === title.toLowerCase()
                );
                if (movieIdx === -1) return "";
                const entry = searchEntries[movieIdx];
                return `<button class="pick-chip" data-idx="${entry.idx}">${escapeHtml(title)}</button>`;
            })
            .join("");

        picksList.querySelectorAll(".pick-chip").forEach((chip) => {
            chip.addEventListener("click", () => {
                const idx = parseInt(chip.dataset.idx);
                selectMovie(idx);
            });
        });
    }

    // ─── Event Listeners ────────────────────────────────
    searchInput.addEventListener("input", (e) => {
        const query = e.target.value.trim();
        clearBtn.classList.toggle("hidden", query.length === 0);

        if (query.length === 0) {
            autocompleteList.classList.add("hidden");
            return;
        }

        const results = searchMovies(query);
        renderAutocomplete(results, query);
    });

    searchInput.addEventListener("keydown", (e) => {
        const items = autocompleteList.querySelectorAll(".autocomplete-item");
        if (!items.length) return;

        if (e.key === "ArrowDown") {
            e.preventDefault();
            activeIndex = Math.min(activeIndex + 1, items.length - 1);
            updateActiveItem(items);
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            activeIndex = Math.max(activeIndex - 1, 0);
            updateActiveItem(items);
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (activeIndex >= 0 && items[activeIndex]) {
                items[activeIndex].click();
            } else if (items.length > 0) {
                items[0].click();
            }
        } else if (e.key === "Escape") {
            autocompleteList.classList.add("hidden");
            searchInput.blur();
        }
    });

    function updateActiveItem(items) {
        items.forEach((item, i) => {
            item.classList.toggle("active", i === activeIndex);
        });
        if (activeIndex >= 0 && items[activeIndex]) {
            items[activeIndex].scrollIntoView({ block: "nearest" });
        }
    }

    clearBtn.addEventListener("click", () => {
        searchInput.value = "";
        clearBtn.classList.add("hidden");
        autocompleteList.classList.add("hidden");
        searchInput.focus();
    });

    // Close autocomplete on outside click
    document.addEventListener("click", (e) => {
        if (!e.target.closest(".search-container")) {
            autocompleteList.classList.add("hidden");
        }
    });

    // Logo resets to home
    logoBtn.addEventListener("click", () => {
        searchInput.value = "";
        clearBtn.classList.add("hidden");
        autocompleteList.classList.add("hidden");
        resultsSection.classList.add("hidden");
        window.scrollTo({ top: 0, behavior: "smooth" });
        searchInput.focus();
    });

    // ─── Initialize ─────────────────────────────────────
    loadData();
})();
