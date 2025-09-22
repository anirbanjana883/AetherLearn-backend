import User from "../models/userModel.js"
import validator from "validator"
import bcrypt from "bcryptjs"
import genToken from "../config/token.js"
import sendMail from "../config/sendMail.js"

// signup 
export const signup = async (req , res)=>{
    try {
        const {name , email , password , role} = req.body
        let existUser = await User.findOne({email})
        if(existUser){
            return res.status(400).json({message:"User already exists"})
        }
        if(!validator.isEmail(email)){
            return res.status(400).json({message:"Enter valid email"})
        }
        if(password.length < 8){
            return res.status(400).json({message:"Enter strong password"})
        }
        let hashPassword = await bcrypt.hash(password,10)
        const user = await User.create({
            name,
            email,
            password : hashPassword,
            role
        })
        let token = await genToken(user._id)
        res.cookie("token",token,{
            httpOnly : true,
            secure : false,
            sameSite : "Strict",
            maxAge : 7 * 60 * 60 * 1000
        })
        return res.status(201).json(user)
    } catch (error) {
        return res.status(500).json({message:`Signup error ${error}`})
    }
}

// login
export const logIn = async (req,res)=>{
    try {
        const {email , password} = req.body
        let user = await User.findOne({email})
        if(!user){
            return res.status(404).json({message:"User not found"})
        }
        let isMatch = await bcrypt.compare(password,user.password)

        if(!isMatch){
            return res.status(400).json({message:"Incorrect Password"})
        }
        let token = await genToken(user._id)
        res.cookie("token",token,{
            httpOnly : true,
            secure : false,
            sameSite : "Strict",
            maxAge : 7 * 60 * 60 * 1000
        })
        return res.status(200).json(user)
    } catch (error) {
        return res.status(500).json({message:`Login error ${error}`})
    }
}

// logout
export const logOut = async (req,res) =>{
    try {
        await res.clearCookie("token", {
            httpOnly: true,
            secure: false,       // set true if using HTTPS
            sameSite: "Strict"
        })
        return res.status(200).json({message:`Logout successfully`})
    } catch (error) {
        return res.status(500).json({message:`Logout error ${error}`})
    }
}

// sendOtp 
export const sendOtp = async ( req,res)=>{
    try {
        const {email} = req.body
        const user = await User.findOne({email})
        if(!user){
            return res.status(404).json({message:"User not found"})
        }
        const otp = Math.floor(1000 + Math.random() * 9000 ).toString()

        user.resetOtp = otp
        user.otpExpires = Date.now() + 5 * 60 * 1000;
        user.isOtpVerified = false 

        await user.save()
        await sendMail(email,otp)

        return res.status(200).json({message:`Otp sent successfully`})
     } catch (error) { 
        return res.status(500).json({message:`Otp sent error ${error}`})
    }
} 

// verify otp
export const verifyOtp = async (req,res)=>{
    try {
        const {email, otp} = req.body
        const user = await User.findOne({email})
        if(!user || user.resetOtp != otp || user.otpExpires < Date.now()){
            return res.status(404).json({message:"Invalid OTP"})
        }
        
        user.isOtpVerified = true
        user.resetOtp = undefined
        user.otpExpires = undefined

        await user.save()
        return res.status(200).json({message:`Otp verified successfully`})
         
    } catch (error) {
        return res.status(500).json({message:`Otp verification error ${error}`})
    }
}

// reser password 
export const  resetPassword = async (req,res)=>{
    try {
        const {email, password} = req.body
        const user = await User.findOne({email})
        if(!user || !user.isOtpVerified){
            return res.status(404).json({message:"OTP verification required"})
        }

        const hashPassword = await bcrypt.hash(password,10)
        user.password = hashPassword
        user.isOtpVerified = false

        await user.save();
        return res.status(200).json({message:`Password reset successfully`})

    } catch (error) {
        return res.status(500).json({message:`Reset password error ${error}`})
    }
}