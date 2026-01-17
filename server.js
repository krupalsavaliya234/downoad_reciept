const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // Serve static files (HTML, CSS, JS)
const ExcelJS = require('exceljs');

// Serve the frontend file on root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'home.html'));
});

// MongoDB Connection
const mongoURI = process.env.MONGO_URI;
mongoose.connect(mongoURI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => console.error('❌ MongoDB connection error:', err));

// Schema Definition
const invoiceSchema = new mongoose.Schema({
    billNo: Number,
    customerName: String,
    total: Number,
    date: { type: Date, default: Date.now },
    pdfFile: {
        data: Buffer,
        contentType: String
    }
});

const Invoice = mongoose.model('Invoice', invoiceSchema);

// Multer setup for file uploads (in-memory storage)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });



// API Endpoint to get next bill number
app.get('/api/next-bill-no', async (req, res) => {
    try {
        const lastInvoice = await Invoice.findOne().sort({ billNo: -1 });
        const nextBillNo = lastInvoice ? lastInvoice.billNo + 1 : 101; // Start from 101
        res.json({ nextBillNo });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch bill number' });
    }
});

// API Endpoint to get all invoices (without PDF data)
app.get('/api/invoices', async (req, res) => {
    try {
        const invoices = await Invoice.find({}, '-pdfFile').sort({ date: -1 });
        res.json(invoices);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch invoices' });
    }
});

// API Endpoint to get a single invoice
app.get('/api/invoices/:id', async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id, '-pdfFile.data');
        if (!invoice) {
            return res.status(404).json({ error: 'Invoice not found' });
        }
        res.json(invoice);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch invoice' });
    }
});

// API Endpoint to get PDF of an invoice
app.get('/api/invoices/:id/pdf', async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id);
        if (!invoice || !invoice.pdfFile) {
            return res.status(404).json({ error: 'PDF not found' });
        }

        res.set('Content-Type', invoice.pdfFile.contentType);
        res.send(invoice.pdfFile.data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch PDF' });
    }
});

// API Endpoint to export invoices to Excel
app.post('/api/export-excel', async (req, res) => {
    try {
        const { startDate, endDate } = req.body;

        // Filter invoices by date range
        // Note: endDate should be inclusive, so we set it to end of day
        const start = new Date(startDate);
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);

        const invoices = await Invoice.find({
            date: { $gte: start, $lte: end }
        }).sort({ date: 1 });

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Invoices');

        worksheet.columns = [
            { header: 'Bill No', key: 'billNo', width: 10 },
            { header: 'Date', key: 'date', width: 15 },
            { header: 'Customer Name', key: 'customerName', width: 30 },
            { header: 'Total', key: 'total', width: 15 }
        ];

        invoices.forEach(inv => {
            worksheet.addRow({
                billNo: inv.billNo,
                date: new Date(inv.date).toLocaleDateString(),
                customerName: inv.customerName,
                total: inv.total
            });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', 'attachment; filename=invoices.xlsx');

        await workbook.xlsx.write(res);
        res.end();
    } catch (error) {
        console.error('Error exporting excel:', error);
        res.status(500).json({ error: 'Failed to export excel' });
    }
});

// API Endpoint to save invoice
app.post('/api/invoices', upload.single('pdf'), async (req, res) => {
    try {
        const { billNo, customerName, total } = req.body;

        if (!req.file) {
            return res.status(400).json({ error: 'No PDF file uploaded' });
        }

        const newInvoice = new Invoice({
            billNo,
            customerName,
            total,
            pdfFile: {
                data: req.file.buffer,
                contentType: 'application/pdf'
            }
        });

        await newInvoice.save();
        console.log(`🧾 Invoice #${billNo} saved for ${customerName}`);
        res.status(201).json({ message: 'Invoice saved successfully!' });
    } catch (error) {
        console.error('Error saving invoice:', error);
        res.status(500).json({ error: 'Failed to save invoice' });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
