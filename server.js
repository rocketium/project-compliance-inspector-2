import express from 'express';
import multer from 'multer';
import cors from 'cors';
import { GoogleGenAI, Type } from '@google/genai';

const app = express();
const port = 3000;

// Configure multer for memory storage to handle file uploads
const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

app.use(cors());
app.use(express.json());

// Store jobs in memory
const jobs = new Map();

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * POST /api/analyze
 * Uploads an image and starts the analysis job.
 * Returns a jobId to track progress.
 */
app.post('/api/analyze', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const jobId = Date.now().toString();
    const base64Image = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;

    // Initialize job status
    jobs.set(jobId, { status: 'processing', submittedAt: new Date() });

    // Start processing asynchronously (fire and forget)
    processImage(jobId, base64Image, mimeType);

    res.json({
      jobId,
      status: 'processing',
      statusEndpoint: `/api/status/${jobId}`
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/status/:jobId
 * Checks the status of an analysis job.
 * Returns the result if completed.
 */
app.get('/api/status/:jobId', (req, res) => {
  const jobId = req.params.jobId;
  const job = jobs.get(jobId);

  if (!job) {
    return res.status(404).json({ error: 'Job not found' });
  }

  res.json(job);
});

/**
 * Helper function to process the image using Gemini
 */
async function processImage(jobId, base64Image, mimeType) {
  try {
    const model = "gemini-3-pro-preview";
    const prompt = `
      Analyze this advertisement or design image in extreme detail.
      
      Your task is to decompose the image into its constituent parts for a design system.
      Identify all distinct elements:
      1. Text blocks (headlines, body copy, disclaimers, prices).
      2. Visual elements (product shots, logos, icons, buttons, graphical shapes).
      
      For each element identified:
      - Classify it into one of these categories: 'Text', 'Logo', 'Product', 'Button', 'Other'.
      - Provide the exact text content (if it is text) or a concise visual description (if it is an image).
      - Provide precise bounding box coordinates (ymin, xmin, ymax, xmax) normalized to 0-1000 scale.
      - Provide a detailed polygon outline (list of x,y coordinates) that tightly encloses the element, also normalized to 0-1000 scale.
      
      Be very precise with the boundaries. Do not overlap boxes if possible unless elements are nested.
      Ensure every visible piece of significant content is captured.
    `;

    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          { inlineData: { mimeType, data: base64Image } },
          { text: prompt }
        ]
      },
      config: {
        thinkingConfig: { thinkingBudget: 32768 },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            elements: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  content: { type: Type.STRING },
                  category: { type: Type.STRING, enum: ["Text", "Logo", "Product", "Button", "Other"] },
                  ymin: { type: Type.NUMBER },
                  xmin: { type: Type.NUMBER },
                  ymax: { type: Type.NUMBER },
                  xmax: { type: Type.NUMBER },
                  polygon: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        x: { type: Type.NUMBER },
                        y: { type: Type.NUMBER },
                      },
                      required: ["x", "y"],
                    },
                  },
                },
                required: ["content", "category", "ymin", "xmin", "ymax", "xmax"],
              },
            },
          },
          required: ["elements"],
        },
      },
    });

    const resultText = response.text;
    const parsedData = JSON.parse(resultText);

    // Normalize coordinates from 0-1000 to 0-1
    const elements = parsedData.elements.map((el, index) => ({
      id: `el-${index}`,
      content: el.content,
      category: el.category,
      box: {
        ymin: el.ymin / 1000,
        xmin: el.xmin / 1000,
        ymax: el.ymax / 1000,
        xmax: el.xmax / 1000,
      },
      polygon: el.polygon ? el.polygon.map(p => ({ x: p.x / 1000, y: p.y / 1000 })) : [],
    }));

    jobs.set(jobId, {
      status: 'completed',
      completedAt: new Date(),
      result: { elements }
    });

  } catch (error) {
    console.error(`Job ${jobId} failed:`, error);
    jobs.set(jobId, {
      status: 'error',
      error: error.message
    });
  }
}

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});