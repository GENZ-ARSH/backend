const express = require('express');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const axios = require('axios');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 5000;

// Environment Variables (set these in Render dashboard)
const MONGODB_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const NODE_ENV = process.env.NODE_ENV || 'production';

// Validate environment variables
if (!MONGODB_URI || !JWT_SECRET || !ADMIN_PASSWORD || !TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    console.error('Missing required environment variables');
    process.exit(1);
}

// Middleware
app.use(helmet());
app.use(cors({
    origin: '*', // Temporary for testing, update to Netlify URL after deployment
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());
app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
}));

// MongoDB Connection
mongoose.connect(MONGODB_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// Schemas
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    class: { type: String, required: true },
    email: { type: String, unique: true },
    isAdmin: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

const newsletterSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    subscribedAt: { type: Date, default: Date.now }
});
const Newsletter = mongoose.model('Newsletter', newsletterSchema);

const reviewSchema = new mongoose.Schema({
    rating: { type: Number, required: true },
    comment: { type: String },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
});
const Review = mongoose.model('Review', reviewSchema);

const analyticsSchema = new mongoose.Schema({
    event: { type: String, required: true },
    category: { type: String, required: true },
    label: { type: String },
    timestamp: { type: Date, default: Date.now }
});
const Analytics = mongoose.model('Analytics', analyticsSchema);

// FAQs for Chatbot
const faqs = [
    { q: 'What is GenZZ Library?', a: 'GenZZ Library is your one-stop platform for free study materials for 10th, 11th, 12th, JEE, NEET, and more! Join 10K+ learners today.' },
    { q: 'How to access books?', a: 'Click "Start Learning" or "Explore Now" to dive into our library. Direct access, no key needed!' },
    { q: 'Is it free?', a: 'Completely free! No subscriptions, no hidden costs, just pure learning for students.' },
    { q: 'How to join Telegram?', a: 'Group: https://t.me/genzzthinks | Channel: https://t.me/genzcoders1' },
    { q: 'How to contribute?', a: 'Contribute via GitHub: https://github.com/GENZ-ARSH or email us at arshtyagi007@gmail.com.' },
    { q: 'What classes are supported?', a: 'We cover 10th, 11th, 12th, JEE Main/Advanced, NEET, and CBSE/State boards.' },
    { q: 'How to contact support?', a: 'Reach us at arshtyagi007@gmail.com or join Telegram: https://t.me/genzcoders1.' },
    { q: 'What are the stats?', a: '10K+ students, 500+ books, 100+ JEE/NEET resources, and counting!' },
    { q: 'How to prepare for JEE?', a: 'Access JEE-specific books, practice papers, and mock tests in the library. Join Telegram for tips!' },
    { q: 'How to prepare for NEET?', a: 'Explore NEET-focused study materials, question banks, and revision notes. Check Telegram for updates.' },
    { q: 'Are NCERT books available?', a: 'Yes, NCERT books for 10th-12th across subjects are in the library!' },
    { q: 'Can I download books?', a: 'Most books are viewable online, some are downloadable. Check the library for details.' },
    { q: 'What subjects are covered?', a: 'Physics, Chemistry, Maths, Biology, English, and more for 10th-12th, JEE, and NEET.' },
    { q: 'How to submit feedback?', a: 'Use the review section on the homepage or message us on Telegram: https://t.me/genzcoders1.' },
    { q: 'Are there mock tests?', a: 'Yes, JEE and NEET mock tests are in the library under "Practice Tests".' },
    { q: 'How to get updates?', a: 'Join our Telegram channel (https://t.me/genzcoders1) or subscribe to our newsletter.' },
    { q: 'Is there a mobile app?', a: 'Not yet, but our site is mobile-friendly! Stay tuned for app updates on Telegram.' },
    { q: 'How to share resources?', a: 'Submit resources via GitHub (https://github.com/GENZ-ARSH) or email arshtyagi007@gmail.com.' },
    { q: 'What is the Telegram group for?', a: 'The group (https://t.me/genzzthinks) is for discussions, doubts, and community support.' },
    { q: 'How to report a bug?', a: 'Report bugs via email (arshtyagi007@gmail.com) or our GitHub issues page.' },
    { q: 'Are there video lectures?', a: 'Currently, we focus on books and notes. Video lectures are planned, stay tuned!' },
    { q: 'How to access premium content?', a: 'No premium content, everything is free! Explore the full library now.' },
    { q: 'Can I request a book?', a: 'Request books via Telegram (https://t.me/genzcoders1) or email arshtyagi007@gmail.com.' },
    { q: 'How to join the community?', a: 'Join our Telegram group (https://t.me/genzzthinks) and follow us on Instagram: @genzzcoders.' },
    { q: 'How to clear doubts?', a: 'Post doubts in our Telegram group (https://t.me/genzzthinks) or use the chatbot for quick answers.' },
    { q: 'Are there study tips?', a: 'Yes, find study tips in our Telegram channel or ask the chatbot for JEE/NEET strategies!' }
];

// Commands List (excluding /admin)
const commandsList = [
    '/help - Show all available commands',
    '/links - Get our social media and contact links',
    '/onboard - Learn how to start learning',
    '/stats - View platform stats',
    '/books - Access study materials',
    '/support - Contact support',
    '/contribute - Contribute to GenZZ',
    '/feedback - Submit feedback',
    '/updates - Get latest updates',
    '/community - System: Join our community',
    '/bug - Report a bug',
    '/request - Request a book or resource'
];

// CSRF Token Generator
function generateCsrfToken() {
    return crypto.randomBytes(32).toString('hex');
}

// JWT Verification Middleware
function verifyToken(req, res, next) {
    const token = req.cookies.token;
    if (!token) {
        req.user = { access: true };
        return next();
    }
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
}

// Send Telegram Message
async function sendTelegramMessage(message) {
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            chat_id: TELEGRAM_CHAT_ID,
            text: message
        });
    } catch (error) {
        console.error('Telegram message failed:', err);
    }
}

// Root Route to Avoid "Cannot GET /" Error
app.get('/', (req, res) => {
    res.json({ message: 'Bhai, backend live hai! APIs ke liye /api/... use kar. 🚀' });
});

// Routes

// CSRF Token Endpoint
app.get('/api/csrf-token', (req, res) => {
    const csrfToken = generateCsrfToken();
    res.json({ csrfToken });
});

// CSP Nonce
app.get('/api/csp-nonce', (req, res) => {
    const nonce = crypto.randomBytes(16).toString('base64');
    res.json({ nonce });
});

// Session Check
app.get('/api/session', (req, res) => {
    const isAuthenticated = req.cookies.isAdmin === 'true' || req.cookies.access === 'true';
    res.json({ authenticated: isAuthenticated });
});

// Admin Login
app.post('/api/admin/login', async (req, res) => {
    const { password, _csrf } = req.body;
    const csrfToken = req.headers['x-csrf-token'];
    if (!_csrf || _csrf !== csrfToken) {
        return res.status(403).json({ error: 'Invalid CSRF token' });
    }
    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Invalid password' });
    }
    try {
        const token = jwt.sign({ isAdmin: true }, JWT_SECRET, { expiresIn: '1h' });
        res.cookie('isAdmin', 'true', { httpOnly: true, secure: NODE_ENV === 'production', sameSite: 'strict' });
        res.json({ success: true, token, redirect: `${FRONTEND_URL}/admin.html` });
    } catch (error) {
        res.status(500).json({ error: 'Admin login failed' });
    }
});

// Onboarding
app.post('/api/onboarding', async (req, res) => {
    const { name, class: classLevel, _csrf } = req.body;
    const csrfToken = req.headers['x-csrf-token'];
    if (!_csrf || _csrf !== csrfToken) {
        return res.status(403).json({ error: 'Invalid CSRF token' });
    }
    try {
        const user = new User({ name, class: classLevel });
        await user.save();
        await sendTelegramMessage(`New user onboarded: ${name} (Class: ${classLevel})`);
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Onboarding failed' });
    }
});

// Newsletter Signup
app.post('/api/newsletter', async (req, res) => {
    const { email, _csrf } = req.body;
    const csrfToken = req.headers['x-csrf-token'];
    if (!_csrf || _csrf !== csrfToken) {
        return res.status(403).json({ error: 'Invalid CSRF token' });
    }
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
        return res.status(400).json({ error: 'Invalid email' });
    }
    try {
        const subscriber = new Newsletter({ email });
        await subscriber.save();
        await sendTelegramMessage(`New newsletter signup: ${email}`);
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Subscription failed' });
    }
});

// Social Links
app.get('/api/social-links', (req, res) => {
    const links = [
        {
            name: 'Group',
            url: 'https://t.me/genzzthinks',
            icon: 'https://upload.wikimedia.org/wikipedia/commons/8/82/Telegram_logo.svg',
            label: 'Join Telegram Group',
            tooltip: 'Join our Telegram Group'
        },
        {
            name: 'Channel',
            url: 'https://t.me/genzcoders1',
            icon: 'https://upload.wikimedia.org/wikipedia/commons/8/82/Telegram_logo.svg',
            label: 'Join Telegram Channel',
            tooltip: 'Join our Telegram Channel'
        },
        {
            name: 'GitHub',
            url: 'https://github.com/GENZ-ARSH',
            icon: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png',
            label: 'Visit GitHub',
            tooltip: 'Check our GitHub'
        },
        {
            name: 'Instagram',
            url: 'https://www.instagram.com/genzzcoders',
            icon: 'https://upload.wikimedia.org/wikipedia/commons/a/a5/Instagram_icon.png',
            label: 'Follow on Instagram',
            tooltip: 'Follow us on Instagram'
        },
        {
            name: 'Email',
            url: 'mailto:arshtyagi007@gmail.com',
            icon: 'https://upload.wikimedia.org/wikipedia/commons/4/4e/Mail_%28iOS%29.svg',
            label: 'Contact Us',
            tooltip: 'Contact us via Email'
        }
    ];
    res.json({ links });
});

// Chatbot
app.post('/api/chat', async (req, res) => {
    const { message, _csrf } = req.body;
    const csrfToken = req.headers['x-csrf-token'];
    if (!_csrf || _csrf !== csrfToken) {
        return res.status(403).json({ error: 'Invalid CSRF token' });
    }
    if (!message) {
        return res.status(400).json({ error: 'Message required' });
    }
    try {
        const commandsMessage = `\n\nAvailable commands:\n${commandsList.join('\n')}`;

        // Commands
        if (message.toLowerCase() === '/help' || message.toLowerCase() === '/commands') {
            return res.json({ response: `Available commands:\n${commandsList.join('\n')}` });
        }
        if (message.toLowerCase() === '/links') {
            return res.json({ response: `Connect with us: Telegram Group - https://t.me/genzzthinks, Channel - https://t.me/genzcoders1, GitHub - https://github.com/GENZ-ARSH, Instagram - @genzzcoders, Email - arshtyagi007@gmail.com${commandsMessage}` });
        }
        if (message.toLowerCase() === '/onboard') {
            return res.json({ response: `Click "Start Learning" to share your name and class, or explore directly!${commandsMessage}` });
        }
        if (message.toLowerCase() === '/stats') {
            return res.json({ response: `10K+ students, 500+ books, 100+ JEE/NEET resources, 50+ contributors!${commandsMessage}` });
        }
        if (message.toLowerCase() === '/books') {
            return res.json({ response: `Access NCERT, JEE, NEET, and CBSE books in the library. Try "Start Learning"!${commandsMessage}` });
        }
        if (message.toLowerCase() === '/support') {
            return res.json({ response: `Need help? Email arshtyagi007@gmail.com or join Telegram: https://t.me/genzcoders1${commandsMessage}` });
        }
        if (message.toLowerCase() === '/contribute') {
            return res.json({ response: `Contribute via GitHub: https://github.com/GENZ-ARSH or email arshtyagi007@gmail.com${commandsMessage}` });
        }
        if (message.toLowerCase() === '/feedback') {
            return res.json({ response: `Submit feedback on the homepage or Telegram: https://t.me/genzcoders1${commandsMessage}` });
        }
        if (message.toLowerCase() === '/updates') {
            return res.json({ response: `Get the latest updates on Telegram: https://t.me/genzcoders1 or subscribe to our newsletter!${commandsMessage}` });
        }
        if (message.toLowerCase() === '/community') {
            return res.json({ response: `Join our Telegram group (https://t.me/genzzthinks) and Instagram: @genzzcoders${commandsMessage}` });
        }
        if (message.toLowerCase() === '/bug') {
            return res.json({ response: `Report bugs via email (arshtyagi007@gmail.com) or GitHub: https://github.com/GENZ-ARSH${commandsMessage}` });
        }
        if (message.toLowerCase() === '/request') {
            return res.json({ response: `Request books or resources via Telegram (https://t.me/genzcoders1) or email arshtyagi007@gmail.com${commandsMessage}` });
        }
        if (message.toLowerCase().startsWith('/admin ')) {
            const password = message.split(' ')[1];
            if (password === ADMIN_PASSWORD) {
                const token = jwt.sign({ isAdmin: true }, JWT_SECRET, { expiresIn: '1h' });
                return res.json({ response: 'Admin login successful! Redirecting to admin panel...', token, redirect: `${FRONTEND_URL}/admin.html` });
            } else {
                return res.json({ response: `Invalid admin password! Try again or contact support: https://t.me/genzcoders1${commandsMessage}` });
            }
        }

        // FAQ Matching
        const faq = faqs.find(f => message.toLowerCase().includes(f.q.toLowerCase()));
        if (faq) {
            return res.json({ response: `${faq.a}${commandsMessage}` });
        }

        // Fallback Response
        const response = `Bhai, yeh query ka jawab nahi mila! Try /help or join Telegram: https://t.me/genzcoders1${commandsMessage}`;
        res.json({ response });
    } catch (error) {
        const commandsMessage = `\n\nAvailable commands:\n${commandsList.join('\n')}`;
        res.status(500).json({ error: `Chatbot error: ${error.message}${commandsMessage}` });
    }
});

// Reviews
app.post('/api/reviews', async (req, res) => {
    const { rating, comment, _csrf } = req.body;
    const csrfToken = req.headers['x-csrf-token'];
    if (!_csrf || _csrf !== csrfToken) {
        return res.status(403).json({ error: 'Invalid CSRF token' });
    }
    if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Invalid rating' });
    }
    try {
        const review = new Review({ rating, comment });
        await review.save();
        const telegramMessage = `New Review:\nRating: ${rating}/5\nComment: ${comment || 'No comment'}\nTime: ${new Date().toLocaleString()}`;
        await sendTelegramMessage(telegramMessage);
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Review submission failed' });
    }
});

// Analytics Tracking
app.post('/api/analytics', async (req, res) => {
    const { event, category, label, _csrf } = req.body;
    const csrfToken = req.headers['x-csrf-token'];
    if (!_csrf || _csrf !== csrfToken) {
        return res.status(403).json({ error: 'Invalid CSRF token' });
    }
    try {
        const analytic = new Analytics({ event, category, label });
        await analytic.save();
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Analytics tracking failed' });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
