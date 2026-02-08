// Middleware to check userId and hasPremiumPlan

import { clerkClient } from "@clerk/express";

// const response = await openai.chat.completions.create({
//     model: "gemini-2.5-flash",
//     messages: [
//         {   role: "system",
//             content: "You are a helpful assistant." 
//         },
//         {
//             role: "user",
//             content: "Explain to me how AI works",
//         },
//     ],
// });


export const auth = async (req, res, next) => {
    try {
        const authObj = typeof req.auth === 'function' ? await req.auth() : req.auth;
        const userId = authObj?.userId;
        if (!userId) {
            return res.status(401).json({ success: false, message: "Unauthorized" });
        }

        // Check premium from session claims directly
        const claims = authObj?.sessionClaims;
        const pla = claims?.pla || '';
        const hasPremiumPlan = pla.includes('premium');

        const user = await clerkClient.users.getUser(userId);

        if(!hasPremiumPlan && user.privateMetadata?.free_usage){
            req.free_usage = user.privateMetadata.free_usage
        } else {
            await clerkClient.users.updateUserMetadata(userId, {
                privateMetadata: {
                    free_usage: 0
                }
            })
            req.free_usage = 0;
        }

        req.userId = userId;
        req.plan = hasPremiumPlan ? 'premium': 'free';
        next()
    } catch (error) {
        console.error('Auth middleware error:', error.message);
        res.status(500).json({success: false, message: error.message})
    }
}