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
 * IAMルーター
 */
const ttts = require("@tokyotower/domain");
const express = require("express");
// import { OK } from 'http-status';
const authentication_1 = require("../middlewares/authentication");
const permitScopes_1 = require("../middlewares/permitScopes");
const validator_1 = require("../middlewares/validator");
const USER_POOL_ID = process.env.ADMINS_USER_POOL_ID;
const cognitoIdentityServiceProvider = new ttts.AWS.CognitoIdentityServiceProvider({
    apiVersion: 'latest',
    region: 'ap-northeast-1',
    credentials: new ttts.AWS.Credentials({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    })
});
const iamRouter = express.Router();
iamRouter.use(authentication_1.default);
/**
 * IAMグループ検索
 */
iamRouter.get('/groups', permitScopes_1.default(['admin']), validator_1.default, (_, res, next) => __awaiter(this, void 0, void 0, function* () {
    try {
        res.set('X-Total-Count', '0');
        res.json([]);
    }
    catch (error) {
        next(error);
    }
}));
/**
 * IAMロール検索
 */
iamRouter.get('/roles', permitScopes_1.default(['admin']), validator_1.default, (_, res, next) => __awaiter(this, void 0, void 0, function* () {
    try {
        res.set('X-Total-Count', '0');
        res.json([]);
    }
    catch (error) {
        next(error);
    }
}));
/**
 * IAMユーザー検索
 */
iamRouter.get('/users', permitScopes_1.default(['admin']), validator_1.default, (req, res, next) => __awaiter(this, void 0, void 0, function* () {
    try {
        const personRepo = new ttts.repository.Person(cognitoIdentityServiceProvider);
        const users = yield personRepo.search({
            userPooId: USER_POOL_ID,
            id: req.query.id,
            username: req.query.username,
            email: req.query.email,
            telephone: req.query.telephone,
            givenName: req.query.givenName,
            familyName: req.query.familyName
        });
        res.set('X-Total-Count', users.length.toString());
        res.json(users);
    }
    catch (error) {
        next(error);
    }
}));
/**
 * IDでユーザー検索
 */
iamRouter.get('/users/:id', permitScopes_1.default(['admin']), validator_1.default, (req, res, next) => __awaiter(this, void 0, void 0, function* () {
    try {
        const personRepo = new ttts.repository.Person(cognitoIdentityServiceProvider);
        const user = yield personRepo.findById({
            userPooId: USER_POOL_ID,
            userId: req.params.id
        });
        res.json(user);
    }
    catch (error) {
        next(error);
    }
}));
exports.default = iamRouter;
