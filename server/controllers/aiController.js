import OpenAI from "openai";
import sql from "../configs/db.js";
import { clerkClient } from "@clerk/express";
import {v2 as cloudinary} from 'cloudinary'
import axios from "axios";
import FormData from 'form-data'
import fs from 'fs'
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdf = require("pdf-parse");

const AI = new OpenAI({
    apiKey: process.env.GEMINI_API_KEY,
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/"
});

export const generateArticle = async (req, res)=>{
    try {
        console.log('[generateArticle] Controller reached. userId:', req.userId, 'plan:', req.plan);
        const userId = req.userId;
        const { prompt, length } = req.body;
        const plan = req.plan;
        const free_usage = req.free_usage;

        console.log('[generateArticle] prompt:', prompt, 'length:', length, 'plan:', plan, 'free_usage:', free_usage);

        //Free user cannot generate article more than 10 times!
        if(plan!=='premium' && free_usage >=10){
            return res.json({success: false, 
                message: "Limit reached. Upgrade to continue"})
        }

        console.log('[generateArticle] Calling AI...');
        const response = await AI.chat.completions.create({
            model: "gemini-2.5-flash",
            messages: [
                {
                    role: "user",
                    content: prompt,
                },
            ],
            temperature: 0.7,
            max_tokens: length,
        });
        console.log('[generateArticle] AI response received');

        const content = response.choices[0].message.content

        console.log('[generateArticle] Inserting into DB...');
        await sql` INSERT INTO creations (user_id, prompt, content, type) 
        VALUES(${userId}, ${prompt}, ${content}, 'article')`;
        console.log('[generateArticle] DB insert done');

        if(plan!='premium'){
            await clerkClient.users.updateUserMetadata(userId,
                {
                    privateMetadata:{
                        free_usage: free_usage+1
                    }
                }
            )
        }

        console.log('[generateArticle] Sending response...');
        res.json({
            success: true,
            content
        })
        console.log('[generateArticle] Response sent');

    } catch (error) {
        console.log('[generateArticle] ERROR:', error.message, error.status, error.statusCode);
        console.log('[generateArticle] Full error:', error);
        res.json({
            success:false,
            message: error.message
        })
    }
}

export const generateBlogTitle = async (req, res)=>{
    try {
        const userId = req.userId;
        const { prompt } = req.body;
        const plan = req.plan;
        const free_usage = req.free_usage;

        //Free user cannot generate article more than 10 times!
        if(plan!=='premium' && free_usage >=10){
            return res.json({success: false, 
                message: "Limit reached. Upgrade to continue"})
        }

        const response = await AI.chat.completions.create({
            model: "gemini-2.5-flash",
            messages: [
                {
                    role: "user",
                    content: prompt,
                },
            ],
            temperature: 0.7,
            max_tokens: 100,
        });

        const content = response.choices[0].message.content

        await sql` INSERT INTO creations (user_id, prompt, content, type) 
        VALUES(${userId}, ${prompt}, ${content}, 'blog-article')`;

        if(plan!='premium'){
            await clerkClient.users.updateUserMetadata(userId,
                {
                    privateMetadata:{
                        free_usage: free_usage+1
                    }
                }
            )
        }

        res.json({
            success: true,
            content
        })

    } catch (error) {
        console.log(error.message)
        res.json({
            success:false,
            message: error.message
        })
    }
}


export const generateImage = async (req, res)=>{
    try {
        const userId = req.userId;
        const { prompt, publish } = req.body;
        const plan = req.plan;

        //Free user cannot generate article more than 10 times!
        if(plan!=='premium'){
            return res.json({success: false, 
                message: "This feature is only available for premium subscription"})
        }

        if(!prompt || typeof prompt !== 'string' || !prompt.trim()){
            return res.status(400).json({ success:false, message: 'Prompt is required' })
        }

        const formData = new FormData()
        formData.append('prompt', prompt)

        const { data } = await axios.post(
            "https://clipdrop-api.co/text-to-image/v1",
            formData,
            {
                headers: {
                    ...formData.getHeaders(),
                    'x-api-key': process.env.CLIPDROP_API_KEY,
                },
                responseType: "arraybuffer",
                timeout: 60000,
            }
        )

        const base64Image = `data:image/png;base64,${Buffer.from(data, 'binary').toString('base64')}`;

        const {secure_url} = await cloudinary.uploader.upload(base64Image)

        await sql` INSERT INTO creations (user_id, prompt, content, type, publish) 
        VALUES(${userId}, ${prompt}, ${secure_url}, 'image', ${publish ?? false})`;

        res.json({
            success: true,
            content: secure_url
        })

    } catch (error) {
        console.log(error.message)
        res.json({
            success:false,
            message: error.message
        })
    }
}

export const removeBackgroundImage = async (req, res)=>{
    try {
        const userId = req.userId;
        const image = req.file;
        const plan = req.plan;

        //Free user cannot remove background without premium!
        if(plan!=='premium'){
            return res.json({success: false, 
                message: "This feature is only available for premium subscription"})
        }

        if(!image){
            return res.status(400).json({ success:false, message: 'Image is required' })
        }

        const {secure_url} = await cloudinary.uploader.upload(image.path, {
            transformation: {
                effect: 'background_removal',
                background_removal: 'remove_the_background'
            }
        })

        await sql` INSERT INTO creations (user_id, prompt, content, type) 
        VALUES(${userId}, 'Remove background from image', ${secure_url}, 'image')`;

        res.json({
            success: true,
            content: secure_url
        })

    } catch (error) {
        console.log(error.message)
        res.json({
            success:false,
            message: error.message
        })
    }
}

export const removeObjectImage = async (req, res)=>{
    try {
        const userId = req.userId;
        const image = req.file;
        const plan = req.plan;
        const { object } = req.body;

        //Free user cannot generate article more than 10 times!
        if(plan!=='premium'){
            return res.json({success: false, 
                message: "This feature is only available for premium subscription"})
        }

        const {public_id} = await cloudinary.uploader.upload(image.path)

        const image_url = cloudinary.url(public_id, {
            transformation: [
                {
                    effect: `gen_remove: ${object}`
                }
            ],
            resource_type: 'image'
        })

        await sql` INSERT INTO creations (user_id, prompt, content, type) 
        VALUES(${userId}, ${`Removed ${object} from image`}, ${image_url}, 'image')`;

        res.json({
            success: true,
            content: secure_url
        })

    } catch (error) {
        console.log(error.message)
        res.json({
            success:false,
            message: error.message
        })
    }
}

export const resumeReview = async (req, res)=>{
    try {
        const userId = req.userId;
        const resume = req.file;
        const plan = req.plan;

        //Free user cannot generate article more than 10 times!
        if(plan!=='premium'){
            return res.json({success: false, 
                message: "This feature is only available for premium subscription"})
        }

        if(resume.size > 5 * 1024 * 1024){
            return res.json({
                success: false,
                message: "Resume size exceed allowed size (5MB)."
            })
        }

        const dataBuffer = fs.readFileSync(resume.path)

        const pdfData = await pdf(dataBuffer)

        const prompt = `Review the following resume and provide constructive feedback
        on its strength, weeknesses, and areas for improvement. Resume
        Content:\n\n${pdfData.text}`

        const response = await AI.chat.completions.create({
            model: "gemini-2.5-flash",
            messages: [
                {
                    role: "user",
                    content: prompt,
                },
            ],
            temperature: 0.7,
            max_tokens: 1000,
        });

        const content = response.choices[0].message.content

        await sql` INSERT INTO creations (user_id, prompt, content, type) 
        VALUES(${userId}, "Review the uploaded resume, ${content}, 'resume-review')`;

        res.json({
            success: true,
            content: content
        })

    } catch (error) {
        console.log(error.message)
        res.json({
            success:false,
            message: error.message
        })
    }
}