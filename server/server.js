import express from 'express';
import cors from 'cors';
import 'dotenv/config';
import { clerkMiddleware } from '@clerk/express'
import aiRouter from './routes/aiRoutes.js';
import connectCloudinary from './configs/cloudinary.js';
import userRouter from './routes/userRoutes.js';

const app = express()

await connectCloudinary()

app.use(cors())
app.use(express.json())

// Wrap clerkMiddleware to catch errors
app.use((req, res, next) => {
    const clerk = clerkMiddleware();
    clerk(req, res, (err) => {
        if (err) {
            console.error('clerkMiddleware error:', err);
        }
        next();
    });
});

app.get('/', (req, res)=>res.send('Server is Live!'))

app.use('/api/ai', aiRouter) //AI route

app.use('/api/user', userRouter) //User route

// Error handler
app.use((err, req, res, next) => {
    console.error('Express error:', err.message, err.status || 500);
    res.status(err.status || 500).json({ success: false, message: err.message });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, ()=>{
    console.log("Server is running on port", PORT)
})

