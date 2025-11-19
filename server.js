import express from 'express';
import multer from 'multer';
import cors from 'cors';
import { GoogleGenAI, Type } from '@google/genai';
import fs from 'fs/promises';
import path from 'path';

const app = express();
const port = 3000;
const DATA_FILE = path.resolve('platforms.json');

// Increase payload limit for base64 images in JSON body (reference logos)
app.use(express.json({ limit: '50mb' }));
app.use(cors());

// Configure multer for memory storage to handle file uploads
const upload = multer({
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Store jobs in memory
const jobs = new Map();

// Initialize Gemini
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Minimal Default Fallback (in case file is missing)
const DEFAULT_PLATFORMS = [
  {
    id: 'default',
    name: 'Default',
    description: 'Standard detailed analysis',
    prompt: `
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
    `
  }
];

let platforms = [];

// Load platforms from file or initialize with defaults
async function loadPlatforms() {
  try {
    const data = await fs.readFile(DATA_FILE, 'utf-8');
    platforms = JSON.parse(data);
    console.log('Loaded platforms from disk.');
  } catch (err) {
    console.log('No platform file found or error reading. Initializing with defaults.');
    platforms = [...DEFAULT_PLATFORMS];
    await savePlatforms();
  }
}

// Save platforms to file
async function savePlatforms() {
  try {
    await fs.writeFile(DATA_FILE, JSON.stringify(platforms, null, 2));
  } catch (err) {
    console.error('Error saving platforms to disk:', err);
  }
}

// Initialize data on start
await loadPlatforms();

// --- Platform Management API ---

app.get('/api/platforms', (req, res) => {
  res.json(platforms);
});

app.post('/api/platforms', async (req, res) => {
  const { id, name, description, prompt, referenceLogo } = req.body;
  if (!id || !name || !prompt) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  if (platforms.some(p => p.id === id)) {
    return res.status(400).json({ error: 'Platform ID already exists' });
  }

  const newPlatform = { id, name, description, prompt, referenceLogo };
  platforms.push(newPlatform);
  await savePlatforms();
  
  res.json(newPlatform);
});

app.put('/api/platforms/:id', async (req, res) => {
  const { id } = req.params;
  const index = platforms.findIndex(p => p.id === id);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Platform not found' });
  }

  platforms[index] = { ...platforms[index], ...req.body };
  await savePlatforms();
  
  res.json(platforms[index]);
});

app.delete('/api/platforms/:id', async (req, res) => {
  const { id } = req.params;
  const initialLength = platforms.length;
  platforms = platforms.filter(p => p.id !== id);
  
  if (platforms.length === initialLength) {
    return res.status(404).json({ error: 'Platform not found' });
  }
  
  await savePlatforms();
  res.json({ success: true });
});

// --- Analysis API ---

/**
 * POST /api/analyze
 * Uploads an image and starts the analysis job.
 * Returns a jobId to track progress.
 * Query Params:
 * - platform: string (id of the platform to use)
 */
app.post('/api/analyze', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const jobId = Date.now().toString();
    const base64Image = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype;
    
    // Determine platform
    const platformId = req.query.platform || 'default';
    const platformConfig = platforms.find(p => p.id === platformId) || platforms.find(p => p.id === 'default');
    
    if (!platformConfig) {
       return res.status(500).json({ error: 'Configuration error: No default platform found.' });
    }

    // Initialize job status
    jobs.set(jobId, { status: 'processing', submittedAt: new Date(), platform: platformConfig.name });

    // Start processing asynchronously (fire and forget)
    processImage(jobId, base64Image, mimeType, platformConfig);

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
async function processImage(jobId, base64Image, mimeType, platformConfig) {
  try {
    const model = "gemini-3-pro-preview";
    let prompt = platformConfig.prompt;
    const parts = [
      { inlineData: { mimeType, data: base64Image } }
    ];

    // Inject reference logo if available in platform config
    if (platformConfig.referenceLogo) {
      parts.push({
        inlineData: {
          mimeType: "image/png",
          data: platformConfig.referenceLogo,
        },
      });
      prompt += `
      
      IMPORTANT: A second image has been provided as a REFERENCE. 
      This reference image contains a specific logo or visual element that is critical.
      You must identify this specific element within the main image (the first image).
      - Ensure the bounding box and polygon outline for this referenced element are pixel-perfect.
      - Verify that the extracted element matches the visual characteristics of the reference.
      `;
    }

    parts.push({ text: prompt });

    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: parts
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