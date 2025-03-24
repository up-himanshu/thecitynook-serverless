import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import User from "../models/User";
import mongoose from "../utils/mongooseConnection";

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  try {
    // Check if admin user already exists
    const existingAdmin = await User.findOne({ email: "up.himanshu@gmail.com" });
    
    if (existingAdmin) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          message: "Default admin user already exists"
        })
      };
    }

    // Create default admin user
    const adminUser = new User({
      email: "up.himanshu@gmail.com",
      password: "pppppppp",
      isAdmin: true
    });

    await adminUser.save();

    return {
      statusCode: 201,
      body: JSON.stringify({
        message: "Default admin user created successfully"
      })
    };
  } catch (error) {
    console.error("Error creating default admin:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: "Error creating default admin user"
      })
    };
  } finally {
    // Close the database connection
    await mongoose.connection.close();
  }
};