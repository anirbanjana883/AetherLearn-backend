import jwt from "jsonwebtoken";

const genToken = async (userId) => {
    try {
        const token = jwt.sign({ userId }, process.env.JWT_SECRET, {
            expiresIn: "7d",
        });

        return token;
    } catch (error) {
        console.error("JWT Generation Error:", error.message);
        throw error; 
    }
};

export default genToken;