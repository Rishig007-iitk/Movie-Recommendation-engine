"""
Build script for Movie Recommendation System.
Reproduces the notebook's preprocessing pipeline and exports JSON data
for the static frontend.

Usage:
    source .venv/bin/activate
    python build_data.py
"""

import os
import ast
import json
import subprocess
import zipfile

import numpy as np
import pandas as pd
import nltk
from nltk.stem.porter import PorterStemmer
from sklearn.feature_extraction.text import CountVectorizer
from sklearn.metrics.pairwise import cosine_similarity

# Ensure NLTK data is available
nltk.download('punkt', quiet=True)
nltk.download('punkt_tab', quiet=True)

# ─── 1. Download dataset via Kaggle API ──────────────────────────────────────

DATA_DIR = os.path.dirname(os.path.abspath(__file__))
MOVIES_CSV = os.path.join(DATA_DIR, "tmdb_5000_movies.csv")
CREDITS_CSV = os.path.join(DATA_DIR, "tmdb_5000_credits.csv")
ZIP_FILE = os.path.join(DATA_DIR, "tmdb-movie-metadata.zip")

if not os.path.exists(MOVIES_CSV) or not os.path.exists(CREDITS_CSV):
    print("📥 Downloading TMDB dataset from Kaggle...")
    subprocess.run(
        ["kaggle", "datasets", "download", "-d", "tmdb/tmdb-movie-metadata", "-p", DATA_DIR],
        check=True,
    )
    # Unzip
    with zipfile.ZipFile(ZIP_FILE, "r") as z:
        z.extractall(DATA_DIR)
    print("✅ Dataset downloaded and extracted.")
else:
    print("✅ Dataset already exists locally.")

# ─── 2. Load and merge datasets ──────────────────────────────────────────────

print("🔄 Loading datasets...")
movies = pd.read_csv(MOVIES_CSV)
credits = pd.read_csv(CREDITS_CSV)

movies = movies.merge(credits, on="title")

# Select relevant columns
movies = movies[["movie_id", "title", "overview", "genres", "keywords", "cast", "crew"]]

# Drop rows with missing overview
movies.dropna(inplace=True)

# ─── 3. Feature extraction (reproducing notebook logic) ──────────────────────

def convert(text):
    """Extract 'name' field from JSON-like list of dicts."""
    L = []
    for i in ast.literal_eval(text):
        L.append(i["name"])
    return L

def convert3(text):
    """Extract top 3 'name' fields from JSON-like list of dicts."""
    L = []
    counter = 0
    for i in ast.literal_eval(text):
        if counter < 3:
            L.append(i["name"])
        counter += 1
    return L

def fetch_director(text):
    """Extract director names from crew JSON."""
    L = []
    for i in ast.literal_eval(text):
        if i["job"] == "Director":
            L.append(i["name"])
    return L

print("🔄 Extracting features...")

movies["genres"] = movies["genres"].apply(convert)
movies["keywords"] = movies["keywords"].apply(convert)
movies["cast"] = movies["cast"].apply(convert3)
movies["crew"] = movies["crew"].apply(fetch_director)

# Convert overview from string to list of words
movies["overview"] = movies["overview"].apply(lambda x: x.split())

# Remove spaces from multi-word names (e.g. "Sam Mendes" -> "SamMendes")
for col in ["genres", "keywords", "cast", "crew"]:
    movies[col] = movies[col].apply(
        lambda x: [i.replace(" ", "") for i in x]
    )

# Store genres for display before combining into tags
genres_display = movies[["movie_id", "genres"]].copy()
genres_display["genres"] = genres_display["genres"].apply(
    lambda x: [g.replace("ScienceFiction", "Science Fiction") for g in x]
)

# Create tags column
movies["tags"] = (
    movies["overview"]
    + movies["genres"]
    + movies["keywords"]
    + movies["cast"]
    + movies["crew"]
)

# Create new dataframe
new_df = movies.drop(columns=["overview", "genres", "keywords", "cast", "crew"])
new_df["tags"] = new_df["tags"].apply(lambda x: " ".join(x))
new_df["tags"] = new_df["tags"].apply(lambda x: x.lower())

# ─── 4. Stemming ─────────────────────────────────────────────────────────────

print("🔄 Applying stemming...")
ps = PorterStemmer()

def stem(text):
    y = []
    for i in text.split():
        y.append(ps.stem(i))
    return " ".join(y)

new_df["tags"] = new_df["tags"].apply(stem)

# ─── 5. Vectorization and similarity ─────────────────────────────────────────

print("🔄 Computing similarity matrix...")
cv = CountVectorizer(max_features=5000, stop_words="english")
vector = cv.fit_transform(new_df["tags"]).toarray()
similarity = cosine_similarity(vector)

print(f"   Matrix shape: {similarity.shape}")

# ─── 6. Export to JSON ────────────────────────────────────────────────────────

PUBLIC_DIR = os.path.join(DATA_DIR, "public", "data")
os.makedirs(PUBLIC_DIR, exist_ok=True)

# 6a. Movies list with metadata for display
print("💾 Exporting movies.json...")

# Get original overview for display
movies_orig = pd.read_csv(MOVIES_CSV)
overview_map = dict(zip(movies_orig["title"], movies_orig["overview"].fillna("")))
id_map = dict(zip(movies_orig["title"], movies_orig["id"]))
vote_map = dict(zip(movies_orig["title"], movies_orig["vote_average"]))

movies_list = []
for idx, row in new_df.iterrows():
    title = row["title"]
    movie_id = int(row["movie_id"])
    genre_row = genres_display[genres_display["movie_id"] == movie_id]
    genres = genre_row["genres"].values[0] if len(genre_row) > 0 else []

    movies_list.append({
        "idx": int(idx),
        "id": movie_id,
        "tmdb_id": int(id_map.get(title, movie_id)),
        "title": title,
        "overview": overview_map.get(title, ""),
        "genres": genres,
        "vote": float(vote_map.get(title, 0)),
    })

# Create index mapping from original df index to list position
idx_to_pos = {m["idx"]: i for i, m in enumerate(movies_list)}

with open(os.path.join(PUBLIC_DIR, "movies.json"), "w") as f:
    json.dump(movies_list, f, separators=(",", ":"))

# 6b. Sparse similarity — top 15 for each movie
print("💾 Exporting similarity.json...")

TOP_N = 15
sim_data = {}

for i in range(len(new_df)):
    original_idx = new_df.index[i]
    # Get similarity scores for this movie, exclude self
    scores = list(enumerate(similarity[i]))
    scores = sorted(scores, key=lambda x: x[1], reverse=True)

    neighbors = []
    for j, score in scores[1 : TOP_N + 1]:
        neighbor_original_idx = new_df.index[j]
        if neighbor_original_idx in idx_to_pos:
            neighbors.append({
                "p": idx_to_pos[neighbor_original_idx],  # position in movies_list
                "s": round(float(score), 4),
            })

    if original_idx in idx_to_pos:
        sim_data[str(idx_to_pos[original_idx])] = neighbors

with open(os.path.join(PUBLIC_DIR, "similarity.json"), "w") as f:
    json.dump(sim_data, f, separators=(",", ":"))

# Print sizes
movies_size = os.path.getsize(os.path.join(PUBLIC_DIR, "movies.json"))
sim_size = os.path.getsize(os.path.join(PUBLIC_DIR, "similarity.json"))
print(f"\n✅ Build complete!")
print(f"   movies.json:     {movies_size / 1024:.1f} KB ({len(movies_list)} movies)")
print(f"   similarity.json: {sim_size / 1024:.1f} KB")
