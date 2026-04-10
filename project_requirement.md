**✅ FINALIZED Technical Requirements Document (TRD)**  
**Project Name:** AI Transcript Cleanup Tool – Conversation-Only Edition

---

### **1. Project Overview & Goal**

Build a secure, fast, and accurate AI-powered system that takes **raw, messy audio transcripts** and outputs **nothing but clean conversation**.

**Core Rule (Non-Negotiable):**  
The final output must contain **ONLY the conversation**.  
Everything else must be removed or cleaned up. No filler words, no repetitions, no timestamps, no stage directions, no small talk, no metadata, no notes.

---

### **2. What the Cleanup Must Do (Strict Rules)**

The system must automatically:

- Remove all filler words (um, uh, ah, like, you know, so, actually, basically, etc.)
- Remove repetitions and stutters
- Remove background sounds and actions ([laughs], [coughs], [door closes], etc.)
- Remove timestamps and technical markers
- Remove greetings, goodbyes, and irrelevant small talk
- Fix grammar, punctuation, and sentence structure
- Make dialogue natural and professional
- Clearly label speakers (e.g., **Client:** or **Lawyer:**)

**Example:**

**Messy Input:**  
"Um yeah so [00:12] Client: I was thinking uh maybe we can you know discuss the contract tomorrow? [laughs] Lawyer: Sure no problem ah let's do that."

**Clean Output (Only Conversation):**  
**Client:** I was thinking we can discuss the contract tomorrow.  
**Lawyer:** Sure, no problem. Let's do that.

---

### **3. Architecture & Agents**

- Use **LangGraph** as the core orchestration engine.
- Two specialized agents that work together:
  1. **Research Agent** – Understands context, fixes speaker names, technical terms, acronyms.
  2. **Cleanup Agent** – Applies all cleaning rules above.
- Agents must use **shared memory** (state) so they never repeat work.
- Full support for **Human-in-the-Loop (HITL)**: system must pause at checkpoints, wait for human review/edit, then resume without losing context.

---

### **4. Performance Requirements**

- **Speed:** First-pass cleanup of a 50-page transcript must complete in **under 5 minutes**.
- **Accuracy:** Cleanup Agent must reach **>90% accuracy** on conversation-only output (measured against Golden Dataset).

---

### **5. Security & Compliance (Mandatory)**

- Use only **Zero Data Retention** APIs.
- All data encrypted:
  - At rest: **AES-256**
  - In transit: **TLS 1.3**
- Designed for sensitive/legal content (attorney-client privilege protection).

---

### **6. Integration & Tech Stack**

| Component              | Technology (Must Use)                  |
|------------------------|----------------------------------------|
| Orchestration          | LangGraph                              |
| Audio → Text Timestamps| Deepgram or Whisper v3                 |
| Frontend / Editor      | Next.js + Tailwind CSS (real-time collaboration) |
| Backend                | Python + LangChain/LangGraph           |

- Word-level timestamps must be preserved for the editor (click word → play audio).

---

