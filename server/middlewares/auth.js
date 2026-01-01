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
        const {userId, has} = await req.auth();
        const hasPremiumPlan = await has({plan: 'premium'});

        const user = await clerkClient.users.getUser(userId);

        if(!hasPremiumPlan && user.privateMetadata.free_usage){
            req.free_usage = user.privateMetadata.free_usage
        } else {
            await clerkClient.users.updateUserMetadata(userId, {
                privateMetadata: {
                    free_usage: 0
                }
            })
            req.free_usage = 0;
        }

        req.plan = hasPremiumPlan ? 'premium': 'free';
        next()
    } catch (error) {
        res.json({success: false, message: error.message})
    }
}