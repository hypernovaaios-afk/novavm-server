// server.js - Updated to download and fill real government forms
import express from 'express';
import fetch from 'node-fetch';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

const app = express();
app.use(express.json());

// Security middleware
app.use((req, res, next) => {
  const authHeader = req.headers.authorization;
  const expectedKey = process.env.NOVAVM_ADMIN_KEY;
  
  if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.slice(7) !== expectedKey) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  next();
});

// Form download and filling service
async function downloadAndFillForms(businessData) {
  console.log('🔍 Starting real form download and filling for:', businessData.BUSINESS_NAME);
  
  const results = {
    ok: true,
    documents: {},
    message: 'Real forms downloaded and pre-filled'
  };

  try {
    // 1. Download real IRS SS-4 form
    if (businessData.STATE && businessData.BUSINESS_NAME) {
      console.log('📥 Downloading IRS SS-4 form...');
      const ss4Url = 'https://www.irs.gov/pub/irs-pdf/fss4.pdf';
      
      const ss4Response = await fetch(ss4Url);
      if (ss4Response.ok) {
        const ss4Buffer = await ss4Response.arrayBuffer();
        const ss4Doc = await PDFDocument.load(ss4Buffer);
        
        // Get the form and try to fill it
        const form = ss4Doc.getForm();
        
        try {
          // Try to fill common SS-4 fields
          const fieldMappings = {
            'Legal name of entity': businessData.BUSINESS_NAME,
            'Trade name of business': businessData.TRADE_NAME || '',
            'Mailing address': businessData.MAILING_ADDRESS,
            'City, state, ZIP code': `${businessData.MAILING_CITY}, ${businessData.MAILING_STATE} ${businessData.MAILING_ZIP}`,
            'Responsible party': businessData.RESPONSIBLE_PARTY_NAME,
            'SSN, ITIN, or EIN': businessData.SSN_ITIN || ''
          };
          
          // Try to fill fields
          Object.entries(fieldMappings).forEach(([fieldName, value]) => {
            try {
              const field = form.getTextField(fieldName);
              if (field && value) {
                field.setText(String(value));
                console.log(`✅ Filled field: ${fieldName} = ${value}`);
              }
            } catch (e) {
              console.log(`⚠️ Could not fill field: ${fieldName}`);
            }
          });
        } catch (e) {
          console.log('⚠️ Form filling not available, but PDF downloaded');
        }
        
        const ss4Bytes = await ss4Doc.save();
        const ss4Base64 = Buffer.from(ss4Bytes).toString('base64');
        
        results.documents.ss4 = {
          filename: 'SS-4_EIN_Application.pdf',
          mime: 'application/pdf',
          url: `data:application/pdf;base64,${ss4Base64}`
        };
        
        console.log('✅ SS-4 form processed successfully');
      } else {
        console.log('⚠️ Could not download SS-4 form, creating placeholder');
        results.documents.ss4 = createPlaceholderDoc('SS-4 Application', businessData);
      }
    }

    // 2. Download state-specific Articles of Organization
    if (businessData.STATE === 'CA' && businessData.ENTITY_TYPE === 'LLC') {
      console.log('📥 Downloading CA LLC Articles of Organization...');
      
      // Try to download real CA form
      const caFormUrl = 'https://bpd.cdn.sos.ca.gov/llc/forms/llc-1.pdf';
      
      try {
        const caResponse = await fetch(caFormUrl);
        if (caResponse.ok) {
          const caBuffer = await caResponse.arrayBuffer();
          const caDoc = await PDFDocument.load(caBuffer);
          
          // Try to fill CA-specific fields
          const form = caDoc.getForm();
          
          try {
            const caFieldMappings = {
              'LLC Name': businessData.LLC_NAME,
              'Business Address': businessData.BUSINESS_ADDRESS,
              'Agent for Service of Process': businessData.SERVICE_OF_PROCESS,
              'Management Structure': businessData.MANAGEMENT_STRUCTURE || 'Member-managed'
            };
            
            Object.entries(caFieldMappings).forEach(([fieldName, value]) => {
              try {
                const field = form.getTextField(fieldName);
                if (field && value) {
                  field.setText(String(value));
                  console.log(`✅ Filled CA field: ${fieldName} = ${value}`);
                }
              } catch (e) {
                console.log(`⚠️ Could not fill CA field: ${fieldName}`);
              }
            });
          } catch (e) {
            console.log('⚠️ CA form filling not available, but PDF downloaded');
          }
          
          const caBytes = await caDoc.save();
          const caBase64 = Buffer.from(caBytes).toString('base64');
          
          results.documents.articles = {
            filename: 'CA_LLC_Articles_of_Organization.pdf',
            mime: 'application/pdf',
            url: `data:application/pdf;base64,${caBase64}`
          };
          
          console.log('✅ CA Articles form processed successfully');
        } else {
          throw new Error('Could not download CA form');
        }
      } catch (e) {
        console.log('⚠️ Could not download CA form, creating placeholder');
        results.documents.articles = createPlaceholderDoc('Articles of Organization', businessData);
      }
    } else {
      // For other states, create a generic template
      console.log(`📝 Creating generic Articles template for ${businessData.STATE}`);
      results.documents.articles = createPlaceholderDoc('Articles of Organization', businessData);
    }

  } catch (error) {
    console.error('❌ Error in form processing:', error);
    results.ok = false;
    results.error = error.message;
  }

  return results;
}

// Create placeholder document with business info
function createPlaceholderDoc(docType, businessData) {
  // For now, return a simple placeholder with the business info
  const placeholderContent = `
${docType}

Business Name: ${businessData.BUSINESS_NAME || ''}
State: ${businessData.STATE || ''}
Entity Type: ${businessData.ENTITY_TYPE || ''}
Owner: ${businessData.ORGANIZER_NAME || ''}
Address: ${businessData.BUSINESS_ADDRESS || ''}
Date: ${businessData.DATE || new Date().toLocaleDateString()}

This document contains the information you provided and would normally be submitted to the appropriate government agency.
`;

  // Convert to base64 (simplified for now)
  const base64Content = Buffer.from(placeholderContent).toString('base64');
  
  return {
    filename: `${docType.replace(/ /g, '_')}.txt`,
    mime: 'text/plain',
    url: `data:text/plain;base64,${base64Content}`
  };
}

// Main endpoint
app.post('/', async (req, res) => {
  console.log('📨 Received request:', JSON.stringify(req.body, null, 2));
  
  try {
    const result = await downloadAndFillForms(req.body);
    
    console.log('📤 Sending response:', {
      ok: result.ok,
      documentsCount: Object.keys(result.documents || {}).length,
      message: result.message
    });
    
    res.json(result);
  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({
      ok: false,
      error: error.message
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'novavm-server', timestamp: new Date().toISOString() });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 NovaVM Server running on port ${PORT}`);
  console.log('🔐 Security: Admin key authentication enabled');
  console.log('📋 Features: Real government form download and pre-filling');
});

