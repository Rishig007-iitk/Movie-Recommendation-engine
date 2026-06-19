# 🎬 CineMatch — AI Movie Recommender

A stunning, AI-powered movie recommendation website built using **Content-Based Filtering** and **Cosine Similarity**. Recommends similar movies based on genres, keywords, cast, crew, and plot descriptions.

![Built with](https://img.shields.io/badge/Built%20with-Python%20%7C%20scikit--learn%20%7C%20Vanilla%20JS-blueviolet)

## 🚀 Live Demo

Deploy to Vercel or GitHub Pages in minutes!

## ✨ Features

- 🔍 **Instant Search** — Fuzzy search across 4,800+ movies with autocomplete
- 🤖 **AI Recommendations** — Content-based filtering using cosine similarity
- 🎨 **Premium UI** — Dark cinematic theme with glassmorphism & micro-animations
- ⚡ **Zero Backend** — Pre-computed data served as static JSON
- 📱 **Fully Responsive** — Works beautifully on desktop, tablet, and mobile

## 🛠️ How It Works

1. **Data Preprocessing** — Merges TMDB movies + credits datasets
2. **Feature Engineering** — Extracts genres, keywords, top 3 cast, director
3. **Tag Creation** — Combines all features into a single text field
4. **Stemming** — Porter Stemmer normalizes words
5. **Vectorization** — CountVectorizer (5000 features) creates BoW representation
6. **Similarity** — Cosine similarity finds the most similar movies
7. **Export** — Top 15 similar movies per film exported as compact JSON

## 📦 Setup

### Prerequisites

- Python 3.8+
- [Kaggle API](https://www.kaggle.com/docs/api) configured (`~/.kaggle/kaggle.json`)

### Install & Build

```bash
# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install Python dependencies
pip install kaggle pandas scikit-learn nltk

# Build data (downloads dataset + generates JSON)
python build_data.py
```

### Run Locally

```bash
# Option 1: Python HTTP server
cd public && python3 -m http.server 3000

# Option 2: npx serve
npx serve public -l 3000
```

Then open [http://localhost:3000](http://localhost:3000)


## 📂 Project Structure

```
├── Movie_Recommender_Engine.ipynb  # Original notebook
├── build_data.py                   # Data preprocessing script
├── package.json                    # NPM config
├── vercel.json                     # Vercel deployment config
├── requirements.txt                # Python dependencies
├── .gitignore
├── README.md
└── public/
    ├── index.html                  # Main page
    ├── style.css                   # Styles
    ├── app.js                      # Application logic
    └── data/
        ├── movies.json             # Movie metadata
        └── similarity.json         # Pre-computed similarities
```

## 📊 Tech Stack

| Layer | Technology |
|-------|-----------|
| ML Pipeline | Python, pandas, scikit-learn, NLTK |
| Frontend | Vanilla HTML/CSS/JS |
| Data | TMDB 5000 Movie Dataset |
| Deployment | Vercel / GitHub Pages |

## 📄 License

MIT
