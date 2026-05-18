import { Router, type IRouter } from "express";
import dashboardRoutes from "./dashboard";
import clientRoutes from "./clients";
import documentRoutes from "./documents";
import recommendRoutes from "./recommend";
import pdfRoutes from "./pdf";
import exportRoutes from "./exports";

const router: IRouter = Router();

router.use(dashboardRoutes);
router.use(clientRoutes);
router.use(documentRoutes);
router.use(recommendRoutes);
router.use(pdfRoutes);
router.use(exportRoutes);

export default router;
