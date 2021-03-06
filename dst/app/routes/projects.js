"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * プロジェクトルーター
 */
const ttts = require("@tokyotower/domain");
const express_1 = require("express");
const authentication_1 = require("../middlewares/authentication");
const permitScopes_1 = require("../middlewares/permitScopes");
const validator_1 = require("../middlewares/validator");
const projectsRouter = express_1.Router();
projectsRouter.use(authentication_1.default);
/**
 * プロジェクト検索
 */
projectsRouter.get('', permitScopes_1.default(['admin']), validator_1.default, (req, res, next) => __awaiter(this, void 0, void 0, function* () {
    try {
        const searchCoinditions = Object.assign({}, req.query, { 
            // tslint:disable-next-line:no-magic-numbers
            limit: (req.query.limit !== undefined) ? Math.min(req.query.limit, 100) : 100, page: (req.query.page !== undefined) ? Math.max(req.query.page, 1) : 1 });
        const projectRepo = new ttts.repository.Project(ttts.mongoose.connection);
        const projects = yield projectRepo.search(searchCoinditions, undefined);
        const totalCount = yield projectRepo.count(searchCoinditions);
        res.set('X-Total-Count', totalCount.toString());
        res.json(projects);
    }
    catch (error) {
        next(error);
    }
}));
/**
 * IDでプロジェクト検索
 */
projectsRouter.get('/:id', permitScopes_1.default(['admin']), validator_1.default, (req, res, next) => __awaiter(this, void 0, void 0, function* () {
    try {
        const projectRepo = new ttts.repository.Project(ttts.mongoose.connection);
        const seller = yield projectRepo.findById({ id: req.params.id }, undefined);
        res.json(seller);
    }
    catch (error) {
        next(error);
    }
}));
exports.default = projectsRouter;
