from flask import Flask, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
from openai import OpenAI
import re
import os



load_dotenv()

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": ["http://localhost:5173", "http://127.0.0.1:5173"]}})


client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))


FINANCE_INSTRUCTIONS = """
You are a helpful, concise personal finance adviser for India.
Follow these rules strictly:

1) ALWAYS answer in the SAME LANGUAGE as the user's question (auto-detect). If the user writes in Hindi or even if the alphabet is english but language in Hindi, reply in Hindi.
2) Keep answers short: 4–5 numbered points only. One sentence per point.
3) If the user asks about investments, give 2–3 examples with proper Indian context. Use concrete names where sensible:
   - Stocks (e.g., Infosys, HDFC Bank)
   - Bonds (e.g., Government of India bonds, AAA-rated PSU bonds)
   - Mutual funds (e.g., SBI Nifty 50 Index Fund, HDFC Liquid Fund)
4) If user asks generally "where to invest" or about gold, include this line verbatim at the end:
   If you want to buy digital gold easily, you can use the click here: [Simplify App](https://www.simplifymoney.in/)
5) No long explanations; only the key ideas.
6) If the question is clearly NOT about personal finance/investing/banking/loans/insurance/tax:
   Reply with exactly: "I do not have experience in this subject matter" — in the SAME LANGUAGE as the user's question.

# IMPORTANT: After your answer text, append one final line **exactly** as:
# LANG: hi   (if you answered in Hindi or Hinglish using Devanagari)
# LANG: en   (if you answered in English)
# Do not add any other text after that line.
"""

@app.route("/query", methods=["GET"])
def query():
    try:
        user_input = request.args.get("q")

        # Check if OpenAI client is available
        if client is None:
            return jsonify({
                "message": "⚠️ AI service unavailable. Please check server configuration.", 
                "lang": "en"
            }), 500

        # Check if API key is set
        if not os.getenv('OPENAI_API_KEY'):
            logger.error("OpenAI API key not found")
            return jsonify({
                "message": "⚠️ AI service configuration error.", 
                "lang": "en"
            }), 500

        collected = ""
        
        # Use the correct OpenAI API method
        try:
            response = client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": FINANCE_INSTRUCTIONS},
                    {"role": "user", "content": user_input}
                ],
                max_tokens=400,
                temperature=0.7
            )
            
            collected = response.choices[0].message.content
            
        except Exception as openai_error:
            return jsonify({
                "message": f"⚠️ AI service error: {str(openai_error)}", 
                "lang": "en"
            }), 500

        # Split out LANG: hi|en from the end
        lang = "en"
        m = re.search(r"(?:\r?\n)?LANG:\s*(hi|en)\s*$", collected, re.IGNORECASE)
        if m:
            lang = m.group(1).lower()
            collected = re.sub(r"(?:\r?\n)?LANG:\s*(?:hi|en)\s*$", "", collected, flags=re.IGNORECASE)

        # Clean message lines
        formatted = "\n".join(line.strip() for line in collected.split("\n") if line.strip())
        
        return jsonify({"message": formatted or "⚠️ Empty response.", "lang": lang})

    except Exception as e:
        return jsonify({
            "message": "⚠️ Sorry—server error. Please try again.", 
            "lang": "en"
        }), 500


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=True)
