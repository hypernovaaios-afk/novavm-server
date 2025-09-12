// server.js - Complete NovaVM Server for BusinessBuilder AI Integration
import express from 'express';
import fetch from 'node-fetch';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.raw({ type: 'text/plain', limit: '50mb' }));

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Content-Length, X-Requested-With, ngrok-skip-browser-warning');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Security middleware - Authentication for protected endpoints
const authenticateRequest = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const expectedKey = process.env.NOVAVM_ADMIN_KEY;
  
  // Allow health checks to pass without auth
  if (req.path === '/health' || req.path === '/agent/health') {
    return next();
  }
  
  if (!expectedKey) {
    return res.status(500).json({ ok: false, error: 'Server configuration error: missing admin key' });
  }
  
  if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.slice(7) !== expectedKey) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  
  next();
};

app.use(authenticateRequest);

// =============================================================================
// HEALTH CHECK ENDPOINTS (NO AUTH REQUIRED)
// =============================================================================

// Main server health check
app.get('/health', (req, res) => {
  res.status(200).json({
    ok: true,
    service: "novavm-server",
    status: "live",
    timestamp: new Date().toISOString(),
    version: "1.0.0"
  });
});

// Agent health check
app.get('/agent/health', (req, res) => {
  res.status(200).json({
    ok: true,
    service: "document_agent",
    status: "live",
    timestamp: new Date().toISOString()
  });
});

// =============================================================================
// SMARTFILE INTEGRATION ENDPOINTS (AUTH REQUIRED)
// =============================================================================

// SmartFile status endpoint
app.get('/smartfile', (req, res) => {
  const smartfileConfig = {
    base_url: process.env.SMARTFILE_BASE_URL || 'Not configured',
    bucket: process.env.SMARTFILE_BUCKET || 'Not configured',
    region: process.env.SMARTFILE_REGION || 'Not configured',
    api_key_set: !!process.env.SMARTFILE_API_KEY,
    api_secret_set: !!process.env.SMARTFILE_API_SECRET
  };

  res.status(200).json({
    ok: true,
    service: "smartfile-proxy",
    status: "connected",
    config: smartfileConfig,
    timestamp: new Date().toISOString()
  });
});

// SmartFile v1 health endpoint
app.get('/smartfile/v1/health', (req, res) => {
  res.status(200).json({
    ok: true,
    service: "smartfile",
    status: "live",
    timestamp: new Date().toISOString()
  });
});

// FIXED: SmartFile list objects endpoint (GET with prefix query)
app.get('/smartfile/v1/objects/:bucket', async (req, res) => {
  try {
    const { bucket } = req.params;
    const { prefix } = req.query;
    
    console.log(`📁 Mock SmartFile list: ${bucket}${prefix ? ' with prefix: ' + prefix : ''}`);
    
    // Mock response for listing objects
    res.status(200).json({
      ok: true,
      items: [
        {
          name: `${prefix || ''}test-document-1.pdf`,
          size: 12345,
          modified: new Date().toISOString()
        },
        {
          name: `${prefix || ''}test-document-2.pdf`, 
          size: 67890,
          modified: new Date().toISOString()
        }
      ],
      bucket: bucket,
      prefix: prefix || '',
      count: 2
    });
    
  } catch (error) {
    console.error('SmartFile list error:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

// FIXED: SmartFile object upload endpoint (POST)
app.post('/smartfile/v1/objects/:bucket/:path(*)', async (req, res) => {
  try {
    const { bucket, path } = req.params;
    
    // Handle different content types properly
    let fileData;
    let fileSize;
    
    if (Buffer.isBuffer(req.body)) {
      fileData = req.body;
      fileSize = req.body.length;
    } else if (typeof req.body === 'string') {
      fileData = req.body;
      fileSize = Buffer.byteLength(req.body, 'utf8');
    } else {
      // Handle JSON data
      fileData = JSON.stringify(req.body);
      fileSize = Buffer.byteLength(fileData, 'utf8');
    }
    
    console.log(`📁 Mock SmartFile upload: ${bucket}/${path} (${fileSize} bytes)`);
    
    res.status(200).json({
      ok: true,
      message: "File uploaded successfully (mock)",
      bucket: bucket,
      path: path,
      size: fileSize,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('SmartFile upload error:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

// FIXED: SmartFile object download endpoint (GET)
app.get('/smartfile/v1/objects/:bucket/:path(*)', async (req, res) => {
  try {
    const { bucket, path } = req.params;
    
    console.log(`📁 Mock SmartFile download: ${bucket}/${path}`);
    
    // Return mock file content
    res.status(200).send('Mock file content from SmartFile proxy server');
    
  } catch (error) {
    console.error('SmartFile download error:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

// =============================================================================
// DOCUMENT GENERATION ENDPOINTS (AUTH REQUIRED)  
// =============================================================================

// Helper function to generate a simple PDF
async function generateMockPDF(title, content) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  
  page.drawText(title, {
    x: 50,
    y: 750,
    size: 16,
    font: font,
    color: rgb(0, 0, 0),
  });
  
  page.drawText(content, {
    x: 50,
    y: 700,
    size: 10,
    font: font,
    color: rgb(0, 0, 0),
    maxWidth: 500,
    lineHeight: 14,
  });
  
  const pdfBytes = await pdfDoc.save();
  const base64 = Buffer.from(pdfBytes).toString('base64');
  return `data:application/pdf;base64,${base64}`;
}

// Main document generation endpoint
app.post('/agent/submit', async (req, res) => {
  try {
    const { intake, jobId } = req.body;
    
    if (!intake) {
      return res.status(400).json({
        ok: false,
        error: 'Missing intake data in request body'
      });
    }

    console.log(`📄 Generating documents for: ${intake.business_name || 'Unknown Business'}`);
    console.log(`📄 Entity type: ${intake.entity_type || 'Unknown'}, State: ${intake.state || 'Unknown'}`);

    // Generate mock PDFs
    const articlesTitle = `Articles of ${intake.entity_type === 'LLC' ? 'Organization' : 'Incorporation'}`;
    const articlesContent = `Business Name: ${intake.business_name}\nState: ${intake.state}\nEntity Type: ${intake.entity_type}\n\nThis is a mock document generated by the NovaVM server for testing purposes.`;
    
    const einTitle = 'IRS Form SS-4 (Application for EIN)';
    const einContent = `Business Name: ${intake.business_name}\nResponsible Party: ${intake.owner_name || 'Not provided'}\nBusiness Purpose: ${intake.business_purpose || 'General business purposes'}\n\nThis is a mock EIN application generated for testing purposes.`;

    const articlesPdf = await generateMockPDF(articlesTitle, articlesContent);
    const einPdf = await generateMockPDF(einTitle, einContent);

    const response = {
      ok: true,
      jobId: jobId || `job_${Date.now()}`,
      documents: {
        articles: {
          filename: `${intake.business_name?.replace(/\s+/g, '_') || 'Business'}_Articles_of_${intake.entity_type === 'LLC' ? 'Organization' : 'Incorporation'}.pdf`,
          url: articlesPdf,
          document_type: intake.entity_type === 'LLC' ? 'Articles of Organization' : 'Articles of Incorporation'
        },
        ss4: {
          filename: `${intake.business_name?.replace(/\s+/g, '_') || 'Business'}_EIN_Application.pdf`,
          url: einPdf,
          document_type: 'EIN Application'
        }
      },
      timestamp: new Date().toISOString(),
      processing_time: '1.2s',
      status: 'completed'
    };

    console.log(`✅ Documents generated successfully for ${intake.business_name}`);
    res.status(200).json(response);

  } catch (error) {
    console.error('💥 Document generation error:', error);
    res.status(500).json({
      ok: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// =============================================================================
// CATCH-ALL ERROR HANDLER
// =============================================================================

// 404 handler for unmatched routes
app.use('*', (req, res) => {
  console.log(`❌ 404 - Route not found: ${req.method} ${req.originalUrl}`);
  res.status(404).json({
    ok: false,
    error: 'Not Found',
    path: req.originalUrl,
    method: req.method,
    available_endpoints: [
      'GET /health',
      'GET /agent/health',
      'GET /smartfile',
      'GET /smartfile/v1/objects/:bucket',
      'POST /smartfile/v1/objects/:bucket/:path',
      'GET /smartfile/v1/objects/:bucket/:path',
      'POST /agent/submit'
    ]
  });
});

// =============================================================================
// START SERVER
// =============================================================================

app.listen(PORT, () => {
  console.log(`🚀 NovaVM Server running on port ${PORT}`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔐 Admin key configured: ${!!process.env.NOVAVM_ADMIN_KEY}`);
  console.log(`📁 SmartFile bucket: ${process.env.SMARTFILE_BUCKET || 'bbai-documents'}`);
  console.log(`✅ Server ready for BusinessBuilder AI integration`);
});

export default app;
