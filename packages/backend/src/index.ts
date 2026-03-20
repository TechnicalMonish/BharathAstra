import dotenv from "dotenv";
dotenv.config();

import app from "./app";

export const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`🚀 BharathAstra Backend running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`🌍 AWS Region: ${process.env.AWS_REGION || "us-east-1"}`);
});

export default app;
