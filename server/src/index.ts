import "dotenv/config";
import cors from "cors";
import express from "express";
import analyticsRouter from "./routes/analytics";
import authRouter from "./routes/auth";
import budgetsRouter from "./routes/budgets";
import categoriesRouter from "./routes/categories";
import goalsRouter from "./routes/goals";
import groupsRouter from "./routes/groups";
import transactionsRouter from "./routes/transactions";
import usersRouter from "./routes/users";

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/users", usersRouter);
app.use("/api/v1/analytics", analyticsRouter);
app.use("/api/v1/categories", categoriesRouter);
app.use("/api/v1/transactions", transactionsRouter);
app.use("/api/v1/budgets", budgetsRouter);
app.use("/api/v1/goals", goalsRouter);
app.use("/api/v1/groups", groupsRouter);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
