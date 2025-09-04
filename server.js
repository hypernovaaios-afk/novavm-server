const http = require('http');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

// Helper function to generate a PDF
async function generatePdfDataUrl(title, content) {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage();
    const { width } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    page.drawText(title, {
        x: 50,
        y: page.getHeight() - 70,
        font: boldFont,
        size: 16,
        color: rgb(0.1, 0.1, 0.1),
    });

    page.drawText(content, {
        x: 50,
        y: page.getHeight() - 120,
        font: font,
        size: 12,
        color: rgb(0.2, 0.2, 0.2),
        lineHeight: 14,
        maxWidth: width - 100,
    });
    
    const pdfDataUri = await pdfDoc.saveAsBase64({ dataUri: true });
    return pdfDataUri;
}

// Create the main server
const server = http.createServer(async (req, res) => {
    // --- Security Check ---
    // We will set this environment variable on Render later.
    const ADMIN_KEY = process.env.NOVAVM_ADMIN_KEY;
    const authHeader = req.headers['authorization'];
    
    if (!ADMIN_KEY || `Bearer ${ADMIN_KEY}` !== authHeader) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Forbidden' }));
        return;
    }

    // --- Request Handling ---
    if (req.method === 'POST' && req.url === '/') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });

        req.on('end', async () => {
            try {
                // For now, we'll just generate placeholder documents like before.
                // In the future, we will use the 'body' variable to create dynamic content.

                const articlesContent = 'This is a placeholder for the Articles of Organization document. It will contain all the necessary details for your entity.';
                const ss4Content = 'This is a placeholder for the EIN Application (Form SS-4). This document is used to apply for an Employer Identification Number from the IRS.';

                const articlesPdfUrl = await generatePdfDataUrl('Articles of Organization', articlesContent);
                const ss4PdfUrl = await generatePdfDataUrl('Form SS-4 (Application for EIN)', ss4Content);

                const responsePayload = {
                    ok: true,
                    documents: {
                        articles: { url: articlesPdfUrl, filename: 'Articles.pdf' },
                        ss4: { url: ss4PdfUrl, filename: 'SS-4.pdf' }
                    }
                };
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(responsePayload));

            } catch (error) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ ok: false, error: 'Failed to generate PDFs', details: error.message }));
            }
        });

    } else {
        // Handle health checks from Render
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('Server is running.');
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});