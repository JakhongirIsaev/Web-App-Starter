import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import branchesRouter from "./branches";
import usersRouter from "./users";
import clientsRouter from "./clients";
import productsRouter from "./products";
import articlesRouter from "./articles";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(branchesRouter);
router.use(usersRouter);
router.use(clientsRouter);
router.use(productsRouter);
router.use(articlesRouter);
router.use(dashboardRouter);

export default router;
