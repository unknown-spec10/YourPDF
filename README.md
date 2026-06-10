# YourPDF & YourImage

YourPDF is a production-grade, privacy-first, open-source PDF and image processing platform. It uses a hybrid processing model where simple operations run client-side in the browser (via WebAssembly), and heavier operations run on the backend.

## Features

### PDF Utilities
- **Merge & Split**: Combine files or extract specific page ranges.
- **Compress**: High-quality or aggressive size reduction.
- **Convert**: PDF to Word (DOCX), Word to PDF, PDF to Images, and Images to PDF.
- **Security**: Password protect or unlock PDFs.
- **OCR**: Transcribe scanned documents into searchable text PDFs.
- **Organize & Edit**: Rotate pages, reorder pages, watermark, and add page numbers.

### Image Utilities
- **Compress Image**: Reduce file weight for JPG, PNG, and WEBP.
- **Resize Image**: Define pixel sizes or scale by percentage.
- **Crop Image**: Trim layouts interactively.
- **Convert Image**: Convert between JPG, PNG, WEBP, BMP, and TIFF.
- **Rotate Image**: Perform 90, 180, or 270 degrees transpositions.
- **Watermark Image**: Stamp custom text overlays at multiple positions.

### Office Utilities
- **Merge Word**: Combine multiple Word documents (.docx) into a single document.
- **Word to Images**: Convert Word pages (.docx) into individual PNG or JPG images.
- **PPT to PDF**: Convert PowerPoint (.pptx) presentations to high-quality PDF files.
- **PPT to Images**: Convert PowerPoint slides (.pptx) into individual PNG or JPG images.
- **Merge PPT**: Combine multiple PowerPoint presentation slide decks (.pptx) into one.

## Repository Layout

```
pdf-toolkit/
├── backend/                  # FastAPI Backend & Celery tasks
│   ├── app/                  # Main application package
│   └── tests/                # Pytest integration/unit tests
├── frontend/                 # Next.js 14 App Router (TypeScript, Tailwind CSS v4, Zustand)
├── nginx/                    # Production reverse proxy configuration
├── docker-compose.yml        # Development Docker Compose file (Redis and Celery)
├── docker-compose.prod.yml   # Production Docker Compose file (Multi-container stack)
└── README.md                 # This documentation
```

## Storage Architecture (Hybrid Fallback)

To run seamlessly out of the box without requiring external cloud accounts, YourPDF uses a dynamic storage routing system:

1. **AWS S3 Mode**: If AWS S3 credentials are set in the `.env` file, processed files are uploaded to S3. Download links are served as secure AWS presigned URLs with a 15-minute expiry.
2. **Local Fallback Mode**: If S3 credentials are not configured, files are stored on the local host/volume inside `backend/static/outputs/` and served directly by the FastAPI static mount.
3. **Automated Cleanup**: In local fallback mode, file deletion is managed automatically. A background Celery cleaner task is dispatched to wipe files from disk exactly 15 minutes after generation.

## Local Development Setup

To run YourPDF locally for development, follow these steps:

### Prerequisites
- Python 3.12+ installed locally.
- Node.js 20+ and npm installed locally.
- Docker and Docker Compose installed.

### 1. Start Infrastructure Services (Redis & Celery)
The Celery worker and Redis run in Docker.
```bash
docker-compose up -d
```

### 2. Set Up the Backend
The FastAPI server runs directly on your host machine during development for faster hot-reloading.

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Create your local `.env` configuration:
   ```bash
   copy .env.template .env
   ```
   *Note: If you want to use S3, fill in your AWS credentials in `.env`. If left empty, the application will automatically fall back to serving files locally.*

3. Set up a Python virtual environment and activate it:
   ```bash
   python -m venv venv
   venv\Scripts\activate
   ```
4. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```
5. Run the FastAPI development server:
   ```bash
   uvicorn app.main:app --reload --port 8000
   ```
   The backend API will be available at `http://localhost:8000`. API documentation is auto-generated at `http://localhost:8000/docs`.

### 3. Set Up the Frontend
1. Navigate to the frontend directory:
   ```bash
   cd ../frontend
   ```
2. Install Node packages:
   ```bash
   npm install
   ```
3. Create your local `.env` configuration:
   ```bash
   copy .env.template .env.local
   ```
4. Run the Next.js development server:
   ```bash
   npm run dev
   ```
   Open `http://localhost:3000` in your browser.

---

## Production Deployment Setup

For production, the entire stack (Next.js, FastAPI, Celery, Redis, and Nginx) is containerized and run behind Nginx acting as a reverse proxy.

### 1. Configure Environment Variables
Create a root level `.env` or fill in environmental variables. The backend and worker containers will read these variables at startup.
```env
AWS_ACCESS_KEY_ID=your_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
AWS_S3_BUCKET_NAME=your_bucket_name
AWS_REGION=us-east-1
```

### 2. Build and Launch the Stack
Run the following command from the project root:
```bash
docker-compose -f docker-compose.prod.yml up -d --build
```

Nginx will bind to port `80` on the host machine and route requests:
- `/` -> Proxies to Next.js Frontend.
- `/api/*` -> Proxies to FastAPI Backend with built-in API rate limiting.
- `/static/*` -> Proxies to Backend static uploads directory for local downloads.

---

## Running Tests

### Backend Tests
From the `backend` folder with your virtual environment activated:
```bash
pytest
```

### Frontend Tests
From the `frontend` folder:
```bash
npm run test
```
