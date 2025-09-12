// server.js - Complete NovaVM Server for BusinessBuilder AI Integration
import express from 'express';
import fetch from 'node-fetch';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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

// SmartFile object upload endpoint
app.post('/smartfile/v1/objects/:bucket/:path(*)', async (req, res) => {
  try {
    const { bucket, path } = req.params;
    const fileData = req.body;
    
    // Mock SmartFile upload - in production, this would integrate with actual SmartFile API
    console.log(`📁 Mock upload to SmartFile: ${bucket}/${path}`);
    
    res.status(200).json({
      ok: true,
      message: "File uploaded successfully",
      bucket: bucket,
      path: path,
      size: Buffer.byteLength(fileData),
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

// SmartFile object download endpoint
app.get('/smartfile/v1/objects/:bucket/:path(*)', async (req, res) => {
  try {
    const { bucket, path } = req.params;
    
    // Mock SmartFile download - in production, this would integrate with actual SmartFile API
    console.log(`📁 Mock download from SmartFile: ${bucket}/${path}`);
    
    // Return a simple mock file for testing
    res.status(200).send('Mock file content from SmartFile');
    
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

// Main document generation endpoint
app.post('/agent/submit', async (req, res) => {
  try {
    const { intake, jobId } = req.body;
    
    if (!intake) {
      return res.status(400).json({
        ok: false,
        error: 'Missing intake data'
      });
    }

    console.log(`📝 Generating documents for: ${intake.business_name}`);
    
    // Generate Articles of Organization/Incorporation
    const articlesDoc = await generateArticlesDocument(intake);
    
    // Generate EIN Application (SS-4)
    const einDoc = await generateEINDocument(intake);
    
    const response = {
      ok: true,
      documents: {
        articles: {
          filename: `${intake.business_name.replace(/[^a-zA-Z0-9]/g, '_')}_Articles_of_${intake.entity_type === 'LLC' ? 'Organization' : 'Incorporation'}.pdf`,
          url: articlesDoc,
          document_type: intake.entity_type === 'LLC' ? 'Articles of Organization' : 'Articles of Incorporation'
        },
        ss4: {
          filename: `${intake.business_name.replace(/[^a-zA-Z0-9]/g, '_')}_EIN_Application.pdf`,
          url: einDoc,
          document_type: 'EIN Application'
        }
      },
      timestamp: new Date().toISOString(),
      jobId: jobId || `job_${Date.now()}`
    };

    res.status(200).json(response);
    
  } catch (error) {
    console.error('Document generation error:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

// =============================================================================
// PDF GENERATION FUNCTIONS
// =============================================================================

async function generateArticlesDocument(intake) {
  try {
    console.log(`📄 Creating Articles of ${intake.entity_type === 'LLC' ? 'Organization' : 'Incorporation'}`);
    
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // US Letter size
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    let yPosition = 750;
    const margin = 50;
    const lineHeight = 20;
    
    // Header
    page.drawText(`Articles of ${intake.entity_type === 'LLC' ? 'Organization' : 'Incorporation'}`, {
      x: margin,
      y: yPosition,
      size: 18,
      font: boldFont,
      color: rgb(0, 0, 0)
    });
    
    yPosition -= 30;
    
    page.drawText(`State of ${intake.state}`, {
      x: margin,
      y: yPosition,
      size: 14,
      font: font,
      color: rgb(0.4, 0.4, 0.4)
    });
    
    yPosition -= 40;
    
    // Document content
    const sections = [
      `1. Entity Name: ${intake.business_name}`,
      `2. Entity Type: ${intake.entity_type}`,
      `3. State of Formation: ${intake.state}`,
      `4. Principal Address: ${intake.principal_address || intake.business_address || 'To be determined'}`,
      `5. Registered Agent: ${intake.registered_agent_name || intake.responsible_party_name || 'To be appointed'}`,
      `6. Purpose: ${intake.business_purpose || 'General business purposes'}`,
      `7. Duration: Perpetual`,
      `8. Management Structure: ${intake.entity_type === 'LLC' ? 'Member-managed' : 'Board-managed'}`,
    ];
    
    sections.forEach(section => {
      if (yPosition < 100) {
        // Add new page if needed
        const newPage = pdfDoc.addPage([612, 792]);
        yPosition = 750;
      }
      
      page.drawText(section, {
        x: margin,
        y: yPosition,
        size: 12,
        font: font,
        color: rgb(0, 0, 0)
      });
      yPosition -= lineHeight;
    });
    
    // Footer
    page.drawText(`Generated by BusinessBuilder AI on ${new Date().toLocaleDateString()}`, {
      x: margin,
      y: 50,
      size: 8,
      font: font,
      color: rgb(0.5, 0.5, 0.5)
    });
    
    const pdfBytes = await pdfDoc.save();
    return `data:application/pdf;base64,${Buffer.from(pdfBytes).toString('base64')}`;
    
  } catch (error) {
    console.error('Error generating Articles document:', error);
    throw error;
  }
}

async function generateEINDocument(intake) {
  try {
    console.log('📄 Creating EIN Application (SS-4)');
    
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]); // US Letter size
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    
    let yPosition = 750;
    const margin = 50;
    const lineHeight = 20;
    
    // Header
    page.drawText('Application for Employer Identification Number (SS-4)', {
      x: margin,
      y: yPosition,
      size: 16,
      font: boldFont,
      color: rgb(0, 0, 0)
    });
    
    yPosition -= 30;
    
    page.drawText('Department of the Treasury - Internal Revenue Service', {
      x: margin,
      y: yPosition,
      size: 12,
      font: font,
      color: rgb(0.4, 0.4, 0.4)
    });
    
    yPosition -= 40;
    
    // Form fields
    const formFields = [
      `1. Legal name of entity: ${intake.business_name}`,
      `2. Trade name of business: ${intake.trade_name || intake.business_name}`,
      `3. Executor, administrator, trustee, "care of" name: N/A`,
      `4a. Mailing address: ${intake.mailing_address || intake.principal_address || intake.business_address}`,
      `4b. City, state, and ZIP code: ${intake.city || ''}, ${intake.state || ''} ${intake.zip_code || ''}`,
      `5a. Street address: ${intake.principal_address || intake.business_address}`,
      `5b. City, state, and ZIP code: ${intake.city || ''}, ${intake.state || ''} ${intake.zip_code || ''}`,
      `6. County and state: ${intake.county || ''}, ${intake.state || ''}`,
      `7a. Name of responsible party: ${intake.responsible_party_name || intake.owner_name}`,
      `7b. SSN, ITIN, or EIN: ${intake.responsible_party_ssn || 'XXX-XX-XXXX'}`,
      `8a. Is this application for a limited liability company: ${intake.entity_type === 'LLC' ? 'Yes' : 'No'}`,
      `8b. If yes, enter the number of LLC members: ${intake.member_count || '1'}`,
      `9a. Type of entity: ${intake.entity_type}`,
      `9b. If a corporation, enter the state of incorporation: ${intake.entity_type.includes('Corp') ? intake.state : 'N/A'}`,
      `10. Reason for applying: Started new business`,
      `11. Date business started: ${intake.formation_date || new Date().toLocaleDateString()}`,
      `12. Closing month of accounting year: December`,
      `13. Highest number of employees expected: ${intake.employee_count || '0'}`,
      `14. Check one box for the principal activity: Other`,
      `15. Indicate principal line of business: ${intake.business_purpose || 'General business'}`,
      `16. Has the applicant entity shown on line 1 ever applied for an EIN before: No`,
      `17. If you have an EIN, enter it here: N/A`,
      `18. Name and title of contact person: ${intake.responsible_party_name || intake.owner_name}`,
    ];
    
    formFields.forEach(field => {
      if (yPosition < 100) {
        // Add new page if needed - simplified for this example
        yPosition = 100;
      }
      
      page.drawText(field, {
        x: margin,
        y: yPosition,
        size: 10,
        font: font,
        color: rgb(0, 0, 0)
      });
      yPosition -= lineHeight * 0.8; // Tighter spacing for form
    });
    
    // Footer
    page.drawText(`Generated by BusinessBuilder AI on ${new Date().toLocaleDateString()}`, {
      x: margin,
      y: 50,
      size: 8,
      font: font,
      color: rgb(0.5, 0.5, 0.5)
    });
    
    const pdfBytes = await pdfDoc.save();
    return `data:application/pdf;base64,${Buffer.from(pdfBytes).toString('base64')}`;
    
  } catch (error) {
    console.error('Error generating EIN document:', error);
    throw error;
  }
}

// =============================================================================
// ERROR HANDLING
// =============================================================================

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: 'Not Found',
    path: req.path,
    method: req.method
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({
    ok: false,
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : error.message
  });
});

// =============================================================================
// SERVER STARTUP
// =============================================================================

app.listen(PORT, () => {
  console.log(`🚀 NovaVM Server running on port ${PORT}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔑 Admin key configured: ${!!process.env.NOVAVM_ADMIN_KEY}`);
  console.log(`📁 SmartFile configured: ${!!process.env.SMARTFILE_API_KEY}`);
  console.log(`🌐 Health check: http://localhost:${PORT}/health`);
});

export default app;
