import base64
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Dict, List
import psycopg2
import numpy as np
from sentence_transformers import SentenceTransformer
from typing import List, Dict, Optional
from huggingface_hub import InferenceClient
import json
import re
from typing import List
from difflib import get_close_matches
from fastapi.middleware.cors import CORSMiddleware
import re
from serpapi import GoogleSearch
# ollama
from ollama import chat
from ollama import ChatResponse


# Database Configuration
DB_CONFIG = {
    "dbname": "gcn",
    "user": "postgres",
    "password": "12345",
    "host": "172.19.171.58",
    "port": "5432"
}

app = FastAPI()

text_model = SentenceTransformer('all-MiniLM-L6-v2')

serp_api_key = "aa3b7f03d31114f28ba8cad1c5d7b1fb8c6c4770e49c65b59ff6e5b5d36fa7d6"

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class QueryRequest(BaseModel):
    query: str


def get_db_connection():
    """Create and return a database connection."""
    return psycopg2.connect(**DB_CONFIG)

def vector_similarity(vec1: List[float], vec2: List[float]) -> float:
    """Compute cosine similarity between two vectors."""
    return np.dot(vec1, vec2) / (np.linalg.norm(vec1) * np.linalg.norm(vec2))

def get_search_query(search_query: str) -> str:
    """
    Generate a refined search query using Ollama.
    """
    system_prompt = (
        "Given the user's query, generate the most suitable search phrase. the search phrase must be short and must contain the title."
        "for Google Search to find relevant reference links, images or videos. "
        "Return ONLY the search phrase without any additional text or explanations."
    )

    try:
        response = chat(
            model="llama3.2:latest",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Find media related to: {search_query}"}
            ]
        )

        return response.get("message", {}).get("content", "").strip()

    except Exception as e:
        print(f"Error generating search query: {e}")
        return search_query  # Fallback to original query

def search_images(search_query: str, max_images: int = 5) -> list:
    """
    Search for images using SerpAPI.
    Returns a list of image URLs.
    """
    try:
        query = get_search_query(search_query)

        params = {
            "engine": "google_images",
            "q": query,
            "tbm": "isch",
            "num": max_images,
            "api_key": serp_api_key
        }

        search = GoogleSearch(params)
        results = search.get_dict()

        if "error" in results:
            print(f"SerpAPI error: {results['error']}")
            return []

        return [img.get("original") for img in results.get("images_results", [])[:max_images] if "original" in img]

    except Exception as e:
        print(f"Error in search_images function for query '{search_query}': {str(e)}")
        return []
    
def search_videos(search_query: str, max_videos: int = 5) -> list:
    """
    Search for YouTube videos using SerpAPI.
    Returns a list of YouTube video IDs.
    """
    try:
        query = get_search_query(search_query)

        params = {
            "engine": "youtube",
            "search_query": query,
            "api_key": serp_api_key
        }

        search = GoogleSearch(params)
        results = search.get_dict()

        if "error" in results:
            print(f"SerpAPI error: {results['error']}")
            return []

        video_links = [vid.get("link") for vid in results.get("video_results", [])[:max_videos] if "link" in vid]

        # Extract video IDs from URLs
        video_ids = [re.search(r"v=([\w-]+)", link).group(1) for link in video_links if re.search(r"v=([\w-]+)", link)]

        return video_ids

    except Exception as e:
        print(f"Error in search_videos function for query '{search_query}': {str(e)}")
        return []

def search_web_links(search_query: str, max_links: int = 5) -> list:
    """
    Search for web links using SerpAPI.
    Returns a list of extracted URLs.
    """
    try:
        params = {
            "engine": "google",
            "q": search_query,
            "api_key": serp_api_key
        }

        search = GoogleSearch(params)
        results = search.get_dict()

        if "error" in results:
            print(f"SerpAPI error: {results['error']}")
            return []

        # Extract links from search results
        web_links = [result.get("link") for result in results.get("organic_results", [])[:max_links] if "link" in result]

        return web_links

    except Exception as e:
        print(f"Error in search_web_links function for query '{search_query}': {str(e)}")
        return []

def get_all_pdf_names() -> List[str]:
    """Retrieve all PDF names from the database."""
    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("SELECT pdf_name FROM pdfdata")
    pdf_names = [row[0] for row in cur.fetchall()]
    cur.close()
    conn.close()
    return pdf_names

def extract_json(text: str) -> dict:
    """Extract JSON from a given text string using regex."""
    match = re.search(r'\{.*\}', text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            print("Failed to parse JSON.")
    return {}

def get_best_matches(extracted_names: List[str], available_names: List[str]) -> List[str]:
    """Find the closest matching PDF names from available names."""
    best_matches = []
    for name in extracted_names:
        matches = get_close_matches(name, available_names, n=1, cutoff=0.6)
        if matches:
            best_matches.append(matches[0])
    return best_matches

def identify_relevant_pdfs(query: str) -> List[str]:
    """
    Use RAG to identify which PDFs are relevant to the query.
    Returns a list of PDF names that are likely to contain the answer.
    """
    pdf_names = get_all_pdf_names()
    if not pdf_names:
        return []

    system_prompt = """
    You are a regulatory compliance assistant. Your task is to identify which PDF documents are relevant to answer the user's query.
    You will be provided with a list of PDF names and a query. Respond with a JSON object containing an array of the most relevant PDF names ,minimum one.
    Example:
    Input: ["name1", "name2", "name3"], "What are the safety requirements?"
    Output Format: {"pdf_names": ["name1", "name2"]}
    """
    # print(pdf_names)
    user_prompt = f"PDF Names: {json.dumps(pdf_names)}\nQuery: {query}"
    
    try:
        response: ChatResponse = chat(model='llama3.2:latest', messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ])
        response_text = response['message']['content']
        extracted_json = extract_json(response_text)
        extracted_names = extracted_json.get("pdf_names", [])
        print(extracted_names)
        return get_best_matches(extracted_names, pdf_names)
    except Exception as e:
        print(f"Error identifying relevant PDFs: {e}")
        return pdf_names

def search_relevant_texts(query_vector: List[float], pdf_names: List[str], threshold: float = 0.5) -> List[dict]:
    """
    Search for relevant text chunks in the specified PDFs with a more flexible threshold.
    """
    conn = get_db_connection()
    cur = conn.cursor()
    
    query = """
        SELECT pdf_name, text_vectors
        FROM pdfdata
        WHERE pdf_name = ANY(%s)
    """
    cur.execute(query, (pdf_names,))
    results = []
    
    for pdf_name, vectors_json in cur.fetchall():
        try:
            vectors = json.loads(vectors_json) if isinstance(vectors_json, str) else vectors_json
            for vec_info in vectors:
                similarity = vector_similarity(query_vector, vec_info['vector'])
                if similarity >= threshold * 0.8:  # Adjust threshold dynamically
                    results.append({
                        "pdf_name": pdf_name,
                        "text": vec_info['text'],
                        "page_number": vec_info['page_number'],
                        "similarity": similarity
                    })
        except Exception as e:
            print(f"Error processing vectors for {pdf_name}: {e}")
    
    cur.close()
    conn.close()
    return sorted(results, key=lambda x: x['similarity'], reverse=True)[:10]

def search_similar_images(query: str, threshold: float = 0.6) -> List[dict]:
    """
    Search for images related to the query using text similarity on key_text.
    Returns a list of relevant images (base64 format) with their PDF names.
    """
    conn = get_db_connection()
    cur = conn.cursor()
    
    cur.execute("SELECT pdf_name, key_text, image FROM pdf_images")
    results = []
    
    query_vector = text_model.encode(query).tolist()
    
    for pdf_name, key_text, image_base64 in cur.fetchall():
        key_text_vector = text_model.encode(key_text).tolist()
        similarity = vector_similarity(query_vector, key_text_vector)
        
        if similarity >= threshold:
            results.append({
                "image_base64": base64.b64encode(image_base64).decode('utf-8'),
                "similarity": similarity
            })
    
    cur.close()
    conn.close()
    
    # Return top 5 most relevant images
    return sorted(results, key=lambda x: x['similarity'], reverse=True)[:5]

def generate_final_answer(query: str, relevant_texts: List[dict]) -> str:
    """
    Use RAG to generate a final answer based on the query and relevant text chunks.
    """
    context = "\n\n".join([f"Context from {text['pdf_name']} (Page {text['page_number']}): {text['text']}" for text in relevant_texts])
    
    system_prompt = f"""
    You are a **regulatory compliance assistant**. Answer the user's query strictly based on the provided context.

    1. **Be precise and factual.** Do not speculate.
    2. **Cite sources inline** using `[Page X]` notation.
    3. **Highlight key regulations/sections** where applicable.
    4. **If the information is not available, respond with:** *"I don't have information on that."*
    5. **Do not mention the PDF** unless it is directly relevant to the response.
    6. **Use Markdown formatting** for structured output with minimal newlines.
    7. **Strictly, Dont mention like the answer formed from the provided context, it creates negative impact. thus, just give the results.**
    8. **Strictly, Dont mention the query on top of the results.**
    Provide a **concise yet detailed** response integrating all relevant data. Include inline page citations (e.g., *"The regulation states [Page X]."*) and summarize the context from the PDF used. At the end, include a reference table listing the PDFs with page numbers and a brief summary of each one.

    ```md
    | PDF Name       | Page Number(s) | Summary |
    |---------------|----------------|---------|
    | Document A    | Page 12, 15    | Key points from these pages. |
    | Regulation B  | Page 8         | Relevant details from this page. |
    ```
    
    context = {context}
    """
    
    try:
        response: ChatResponse = chat(
            model='llama3.2:latest', messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": query}
            ])
        
        return response['message']['content']
    except Exception as e:
        return f"Error generating answer: {str(e)}"

@app.post("/api/query")
def process_query(request: QueryRequest) -> Dict:
    query = request.query
    try:
        relevant_pdfs = identify_relevant_pdfs(query)
        if not relevant_pdfs:
            return {"error": "No relevant PDFs found"}
        
        query_vector = text_model.encode(query).tolist()
        relevant_texts = search_relevant_texts(query_vector, relevant_pdfs)
        if not relevant_texts:
            return {"error": "No relevant text found in the identified PDFs"}
        
        answer = generate_final_answer(query, relevant_texts)
        
        similar_images = search_similar_images(query)

        search_query = get_search_query(query)
        online_images = search_images(search_query)
        online_videos = search_videos(search_query)
        online_links = search_web_links(search_query)
        
        pdf_refs = {}
        for text in relevant_texts:
            if text['pdf_name'] not in pdf_refs:
                pdf_refs[text['pdf_name']] = {
                    "pdf_name": text['pdf_name'],
                    "page_numbers": [],
                }
            if text['page_number'] not in pdf_refs[text['pdf_name']]["page_numbers"]:
                pdf_refs[text['pdf_name']]["page_numbers"].append(text['page_number'])
        
        print(f"answer : {True if query else False}")
        print(f"pdf_reference : {True if pdf_refs else False}")
        print(f"images : {True if similar_images else False}")
        
        return {
            "query": query,
            "answer": answer,
            "pdf_references": list(pdf_refs.values()),
            "similar_images": similar_images,
            "online_images": online_images,
            "online_videos": online_videos,
            "online_links": online_links
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Processing failed: {str(e)}")

            
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)