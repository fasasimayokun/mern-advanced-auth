import User from "../models/user.model.js";
import bcryptjs from "bcryptjs";
import crypto from "crypto";
import { generateVerificationToken } from "../utils/generateVerificationToken.js";
import { generateTokenAndSetCookie } from "../utils/generateTokenAndSetCookie.js";
import { sendVerificationEmail, sendWelcomeEmail, sendPasswordResetEmail, sendResetSuccessEmail } from "../mailtrap/emails.js";

export const signup = async (req, res) => {
    const {email, password, name} = req.body;
    try {
        if(!email || !password || !name ) {
            throw new Error("All fields are required");
        }
        // check if user already exists
        const userAlreadyExits = await User.findOne({ email });
        if (userAlreadyExits) {
            return res.status(400).json({success:false, message: "User already exists"});
        }
        // hash the password using bcryptjs
        const hashedPassword = await bcryptjs.hash(password, 10);
        const verificationToken = generateVerificationToken();
        const user = new User({
            email,
            password: hashedPassword,
            name,
            verificationToken,
            verificationTokenExpiresAt: Date.now() + 24 * 60 * 60 * 1000 // 24hours
        });

        await user.save();

        // generate jwt token and setcookie for new users
        generateTokenAndSetCookie(res, user._id);

        // after creating users send a verification mail with the verification token
        await sendVerificationEmail(user.email,verificationToken);

        res.status(201).json({
            success: true,
            message: "User created successfullly",
            user: {
                ...user._doc,
                password:undefined,
            },
        });
    } catch (error) {
        res.status(400).json({ success:false, message: error.message});
    }
};

export const verifyEmail = async (req, res) => {
    const { code } =  req.body;
    try {
        const user = await User.findOne({
            verificationToken: code,
            verificationTokenExpiresAt: { $gt: Date.now() }
        });

        if(!user) {
            return res.status(400).json({success: false, message: "Invalid or expired verification code"});
        }

        user.isVerified = true;
        user.verificationToken = undefined;
        user.verificationTokenExpiresAt = undefined;
        await user.save();

        await sendWelcomeEmail(user.email, user.name);
        
        res.status(200).json({
            success: true, 
            message: "Email verified successfully",
            user: {
                ...user._doc,
                password: undefined,
            }
        });
    } catch (error) {
        console.log("error in verifyEmail", error);
        res.status(500).json({ success:false, message: error.message});
    }
};

export const login = async (req, res) => {
    const {email, password} = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ success: false, message: "Invalid credentials"});
        }
        const isPasswordValid = await bcryptjs.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(400).json({ success: false, message: "Invalid credentials"});
        }

        generateTokenAndSetCookie(res, user._id);

        user.lastLogin = new Date();
        await user.save();

        res.status(200).json({
            success: true,
            message: "Logged in successfully",
            user: {
                ...user._doc,
                password: undefined,
            },
        });
    } catch (error) {
        console.log("Error in Login controller", error.message);
        res.status(500).json({ success:false, message: error.message});
    }
};

export const logout = async (req, res) => {
    try {
        res.clearCookie("token");
        res.status(200).json({success: true, message: "Logged out successfully"});
    } catch (error) {
        console.log("Error in Logout controller", error.message);
        res.status(500).json({ success:false, message: error.message});
    }
};

export const forgotPassword = async (req, res) => {
    const { email } = req.body;
    try {
        const user = await User.findOne({ email });
        if(!user) {
            return res.status(404).Json({ success: false, message: "User not found"});
        }

        // generate reset token
        const resetToken = crypto.randomBytes(20).toString("hex");
        const resetTokenExpiresAt = Date.now() + 1 * 60 * 60 * 1000 // 1hours in millseconds from now

        user.resetPasswordToken = resetToken;
        user.resetPasswordExpiresAt = resetTokenExpiresAt;

        await user.save();

        // send email
        await sendPasswordResetEmail(user.email, `${process.env.CLIENT_URL}/reset-password/${resetToken}`);

        res.status(200).json({ success: true, message: "Password reset link sent to your email"});
    } catch (error) {
        console.log("Error in forgot password controller", error.message);
        res.status(500).json({ success:false, message: error.message});
    }
};

export const reseetPassword = async (req, res) => {
    const {token} = req.params;
    const { password } = req.body;
    try {
        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpiresAt: { $gt: Date.now()},
        });
        if(!user) {
            return res.status(400).json({ success: false, message: "Invalid or expired reset token"});
        }

        // update password
        const hashedPassword = await bcryptjs.hash(password, 10);
        
        user.password = hashedPassword;

        user.resetPasswordToken = undefined;
        user.resetPasswordExpiresAt = undefined;

        await user.save();

        // send email
        await sendResetSuccessEmail(user.email);

        res.status(200).json({ success: true, message: "Password reset successful"});
    } catch (error) {
        console.log("Error in resetPassword controller", error.message);
        res.status(500).json({ success:false, message: error.message});
    }
};

export const checkAuth = async (req, res) => {
    try {
        const user = await User.findById(req.userId).select("-password");
        if(!user) {
            return res.status(400).json({ success: false, message: "User not found"});
        }

        res.status(200).json({ success: true, user });
    } catch (error) {
        console.log("Error in checkAuth controller", error.message);
        res.status(500).json({ success:false, message: error.message});
    }
};