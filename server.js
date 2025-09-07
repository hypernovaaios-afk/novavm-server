// server.js - Updated with Health Check Endpoints
import express from 'express';
import fetch from 'node-fetch';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

const app = express();
app.use(express.json());

// Security middleware
app.use((req, res, next) => {
  const authHeader = req.headers.authorization;
  const expectedKey = process.env.NOVAVM_ADMIN_KEY;
  
  if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.slice(7) !== expectedKey) {
    // Allow health checks to pass without auth
    if (req.path === '/health' || req.path === '/agent/health') {
        return next();
    }
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  next();
});

// ===================================================================
// == START: NEW HEALTH CHECK ENDPOINTS TO ADD
// ===================================================================

// Main server health check
app.get('/health', (req, res) => {
  res.status(200).json({
    ok: true,
    service: "novavm-server",
    status: "live",
    timestamp: new Date().toISOString()
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

// ===================================================================
// == END: NEW HEALTH CHECK ENDPOINTS
// ===================================================================


// Create a properly filled PDF by overlaying text instead of trying to fill form fields
async function createFilledPDF(templateUrl, businessData, formType) {
  console.log(`📝 Creating filled PDF for ${formType}...`);
  
  try {
    // Try to download the real form first
    const response = await fetch(templateUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    if (response.ok) {
      console.log(`✅ Downloaded real ${formType} form`);
      const buffer = await response.arrayBuffer();
      const pdfDoc = await PDFDocument.load(buffer);
      
      // Add text overlay instead of trying to fill form fields
      const pages = pdfDoc.getPages();
      const firstPage = pages[0];
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      
      // Add business info as overlay text
      if (formType === 'SS-4') {
        // Add SS-4 specific overlays
        firstPage.drawText(businessData.LEGAL_NAME || '', { x: 150, y: 650, size: 10, font, color: rgb(0, 0, 0) });
        firstPage.drawText(businessData.MAILING_ADDRESS || '', { x: 150, y: 620, size: 10, font, color: rgb(0, 0, 0) });
        firstPage.drawText(businessData.RESPONSIBLE_PARTY_NAME || '', { x: 150, y: 590, size: 10, font, color: rgb(0, 0, 0) });
      } else if (formType === 'CA-Articles') {
        // Add CA Articles specific overlays
        firstPage.drawText(businessData.LLC_NAME || '', { x: 150, y: 600, size: 12, font, color: rgb(0, 0, 0) });
        firstPage.drawText(businessData.SERVICE_OF_PROCESS || '', { x: 150, y: 570, size: 10, font, color: rgb(0, 0, 0) });
        firstPage.drawText(businessData.BUSINESS_ADDRESS || '', { x: 150, y: 540, size: 10, font, color: rgb(0, 0, 0) });
      }
      
      const pdfBytes = await pdfDoc.save();
      return Buffer.from(pdfBytes).toString('base64');
    }
  } catch (error) {
    console.log(`⚠️ Could not download ${formType} form:`, error.message);
  }
  
  // Fallback: Create a professional-looking document
  console.log(`📄 Creating professional ${formType} document as fallback`);
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // US Letter size
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  
  let yPosition = 750;
  
  // Header
  page.drawText(formType === 'SS-4' ? 'Application for Employer Identification Number (SS-4)' : 'Articles of Organization', {
    x: 50, y: yPosition, size: 16, font: boldFont, color: rgb(0, 0, 0)
  });
  
  yPosition -= 40;
  
  // Business information
  const info = [
    ['Legal Name:', businessData.LEGAL_NAME || businessData.LLC_NAME || ''],
    ['Business Address:', businessData.BUSINESS_ADDRESS || ''],
    ['Mailing Address:', businessData.MAILING_ADDRESS || ''],
    ['State:', businessData.STATE || ''],
    ['Entity Type:', businessData.ENTITY_TYPE || ''],
    ['Responsible Party:', businessData.RESPONSIBLE_PARTY_NAME || businessData.ORGANIZER_NAME || ''],
    ['Date:', businessData.DATE || new Date().toLocaleDateString()],
  ];
  
  if (formType === 'SS-4') {
    info.push(['Reason for Application:', businessData.REASON || 'Started new business']);
  }
  
  info.forEach(([label, value]) => {
    if (value) {
      page.drawText(label, { x: 50, y: yPosition, size: 11, font: boldFont, color: rgb(0, 0, 0) });
      page.drawText(value, { x: 200, y: yPosition, size: 11, font, color: rgb(0, 0, 0) });
      yPosition -= 25;
    }
  });
  
  // Footer note
  yPosition -= 40;
  page.drawText('This document contains the information you provided and should be submitted to the appropriate government agency.', {
    x: 50, y: yPosition, size: 10, font, color: rgb(0.3, 0.3, 0.3), maxWidth: 500
  });
  
  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes).toString('base64');
}

app.post('/', async (req, res) => {
  console.log('Received request:', JSON.stringify(req.body, null, 2));
  
  try {
    const businessData = req.body;
    const results = { ok: true, documents: {} };
    
    // Generate SS-4 (EIN Application)
    console.log('🔍 Generating SS-4 form...');
    const ss4Base64 = await createFilledPDF('https://www.irs.gov/pub/irs-pdf/fss4.pdf', businessData, 'SS-4');
    results.documents.ss4 = {
      filename: 'SS-4_EIN_Application.pdf',
      mime: 'application/pdf',
      url: `data:application/pdf;base64,${ss4Base64}`
    };
    
    // Generate Articles of Organization (if LLC)
    if (businessData.ENTITY_TYPE === 'LLC' && businessData.STATE === 'CA') {
      console.log('🔍 Generating CA Articles of Organization...');
      const articlesBase64 = await createFilledPDF('https://bpd.cdn.sos.ca.gov/llc/forms/llc-1.pdf', businessData, 'CA-Articles');
      results.documents.articles = {
        filename: 'Articles_of_Organization.pdf',
        mime: 'application/pdf',
        url: `data:application/pdf;base64,${articlesBase64}`
      };
    }
    
    console.log('📤 Sending response with', Object.keys(results.documents).length, 'documents');
    res.json(results);
    
  } catch (error) {
    console.error('❌ Error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

const port = process.env.PORT || 10000;
app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
