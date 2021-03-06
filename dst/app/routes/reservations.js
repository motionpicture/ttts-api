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
 * 予約ルーター
 */
const ttts = require("@tokyotower/domain");
const createDebug = require("debug");
const express = require("express");
// tslint:disable-next-line:no-submodule-imports
const check_1 = require("express-validator/check");
const http_status_1 = require("http-status");
const moment = require("moment");
const _ = require("underscore");
const authentication_1 = require("../middlewares/authentication");
const permitScopes_1 = require("../middlewares/permitScopes");
const validator_1 = require("../middlewares/validator");
const reservation_1 = require("../util/reservation");
const debug = createDebug('ttts-api:routes:reservations');
const redisClient = ttts.redis.createClient({
    host: process.env.REDIS_HOST,
    // tslint:disable-next-line:no-magic-numbers
    port: parseInt(process.env.REDIS_PORT, 10),
    password: process.env.REDIS_KEY,
    tls: { servername: process.env.REDIS_HOST }
});
const reservationsRouter = express.Router();
reservationsRouter.use(authentication_1.default);
/**
 * 印刷トークン発行
 */
reservationsRouter.post('/print/token', permitScopes_1.default(['admin']), validator_1.default, (req, res, next) => __awaiter(this, void 0, void 0, function* () {
    try {
        const tokenRepo = new ttts.repository.Token(redisClient);
        const token = yield tokenRepo.createPrintToken(req.body.ids);
        debug('printToken created.');
        res.status(http_status_1.CREATED)
            .json({ token });
    }
    catch (error) {
        next(error);
    }
}));
/**
 * distinct検索
 */
reservationsRouter.get('/distinct/:field', permitScopes_1.default(['admin']), ...[
    check_1.query('reservationFor.startFrom')
        .optional()
        .isISO8601()
        .toDate(),
    check_1.query('reservationFor.startThrough')
        .optional()
        .isISO8601()
        .toDate(),
    check_1.query('reservationFor.endFrom')
        .optional()
        .isISO8601()
        .toDate(),
    check_1.query('reservationFor.endThrough')
        .optional()
        .isISO8601()
        .toDate(),
    check_1.query('modifiedFrom')
        .optional()
        .isISO8601()
        .toDate(),
    check_1.query('modifiedThrough')
        .optional()
        .isISO8601()
        .toDate()
], validator_1.default, (req, res, next) => __awaiter(this, void 0, void 0, function* () {
    try {
        // 予約検索条件
        const conditions = Object.assign({}, req.query
        // tslint:disable-next-line:no-magic-numbers
        // limit: (req.query.limit !== undefined) ? Math.min(req.query.limit, 100) : 100,
        // page: (req.query.page !== undefined) ? Math.max(req.query.page, 1) : 1,
        // sort: (req.query.sort !== undefined) ? req.query.sort : undefined,
        );
        // 予約を検索
        debug('searching reservations...', conditions);
        const reservationRepo = new ttts.repository.Reservation(ttts.mongoose.connection);
        const results = yield reservationRepo.distinct(req.params.field, conditions);
        res.json(results);
    }
    catch (error) {
        next(error);
    }
}));
/**
 * IDで予約取得
 */
reservationsRouter.get('/:id', permitScopes_1.default(['reservations.read-only']), validator_1.default, (req, res, next) => __awaiter(this, void 0, void 0, function* () {
    try {
        // 予約を検索
        debug('searching reservation by id...', req.params.id);
        const reservationRepo = new ttts.repository.Reservation(ttts.mongoose.connection);
        const reservation = yield reservationRepo.findById({ id: req.params.id });
        res.json(reservation_1.tttsReservation2chevre(reservation));
    }
    catch (error) {
        next(error);
    }
}));
/**
 * 予約検索
 */
reservationsRouter.get('', permitScopes_1.default(['reservations.read-only']), ...[
    check_1.query('reservationFor.startFrom')
        .optional()
        .isISO8601()
        .toDate(),
    check_1.query('reservationFor.startThrough')
        .optional()
        .isISO8601()
        .toDate(),
    check_1.query('reservationFor.endFrom')
        .optional()
        .isISO8601()
        .toDate(),
    check_1.query('reservationFor.endThrough')
        .optional()
        .isISO8601()
        .toDate(),
    check_1.query('modifiedFrom')
        .optional()
        .isISO8601()
        .toDate(),
    check_1.query('modifiedThrough')
        .optional()
        .isISO8601()
        .toDate()
], validator_1.default, (req, res, next) => __awaiter(this, void 0, void 0, function* () {
    try {
        // 互換性維持のためｎ
        if (!_.isEmpty(req.query.performanceId)) {
            req.query.performance = req.query.performanceId;
        }
        // 予約検索条件
        const conditions = Object.assign({}, req.query, { 
            // tslint:disable-next-line:no-magic-numbers
            limit: (req.query.limit !== undefined) ? Math.min(req.query.limit, 100) : 100, page: (req.query.page !== undefined) ? Math.max(req.query.page, 1) : 1, sort: (req.query.sort !== undefined) ? req.query.sort : undefined, 
            // デフォルトで余分確保分を除く
            additionalProperty: {
                $nin: [{ name: 'extra', value: '1' }]
            } });
        // 予約を検索
        debug('searching reservations...', conditions);
        const reservationRepo = new ttts.repository.Reservation(ttts.mongoose.connection);
        const count = yield reservationRepo.count(conditions);
        const reservations = yield reservationRepo.search(conditions);
        res.set('X-Total-Count', count.toString())
            .json(reservations.map(reservation_1.tttsReservation2chevre));
    }
    catch (error) {
        next(error);
    }
}));
/**
 * 入場
 */
reservationsRouter.post('/:id/checkins', permitScopes_1.default(['reservations.checkins']), (req, __, next) => {
    req.checkBody('when', 'invalid when')
        .notEmpty()
        .withMessage('when is required')
        .isISO8601();
    next();
}, validator_1.default, (req, res, next) => __awaiter(this, void 0, void 0, function* () {
    try {
        const reservationRepo = new ttts.repository.Reservation(ttts.mongoose.connection);
        const taskRepo = new ttts.repository.Task(ttts.mongoose.connection);
        const checkin = {
            when: moment(req.body.when)
                .toDate(),
            where: req.body.where,
            why: req.body.why,
            how: req.body.how
        };
        const reservation = yield reservationRepo.checkIn({
            id: req.params.id,
            checkin: checkin
        });
        // レポート更新タスク作成
        const taskAttributes = ttts.factory.task.updateOrderReportByReservation.createAttributes({
            status: ttts.factory.taskStatus.Ready,
            runsAt: new Date(),
            remainingNumberOfTries: 3,
            // tslint:disable-next-line:no-null-keyword
            lastTriedAt: null,
            numberOfTried: 0,
            executionResults: [],
            data: { reservation: reservation }
        });
        yield taskRepo.save(taskAttributes);
        // 集計タスク作成
        const aggregateTask = {
            name: ttts.factory.taskName.AggregateEventReservations,
            status: ttts.factory.taskStatus.Ready,
            runsAt: new Date(),
            remainingNumberOfTries: 3,
            // tslint:disable-next-line:no-null-keyword
            lastTriedAt: null,
            numberOfTried: 0,
            executionResults: [],
            data: { id: reservation.reservationFor.id }
        };
        yield taskRepo.save(aggregateTask);
        res.status(http_status_1.NO_CONTENT)
            .end();
    }
    catch (error) {
        next(error);
    }
}));
/**
 * 入場取消
 * 入場日時がid
 */
reservationsRouter.delete('/:id/checkins/:when', permitScopes_1.default(['reservations.checkins']), validator_1.default, (req, res, next) => __awaiter(this, void 0, void 0, function* () {
    try {
        const reservationRepo = new ttts.repository.Reservation(ttts.mongoose.connection);
        const taskRepo = new ttts.repository.Task(ttts.mongoose.connection);
        const checkin = {
            when: req.params.when,
            where: '',
            why: '',
            how: ''
        };
        const reservation = yield reservationRepo.cancelCheckIn({
            id: req.params.id,
            checkin: checkin
        });
        // レポート更新タスク作成
        const taskAttributes = ttts.factory.task.updateOrderReportByReservation.createAttributes({
            status: ttts.factory.taskStatus.Ready,
            runsAt: new Date(),
            remainingNumberOfTries: 3,
            // tslint:disable-next-line:no-null-keyword
            lastTriedAt: null,
            numberOfTried: 0,
            executionResults: [],
            data: { reservation: reservation }
        });
        yield taskRepo.save(taskAttributes);
        // 集計タスク作成
        const aggregateTask = {
            name: ttts.factory.taskName.AggregateEventReservations,
            status: ttts.factory.taskStatus.Ready,
            runsAt: new Date(),
            remainingNumberOfTries: 3,
            // tslint:disable-next-line:no-null-keyword
            lastTriedAt: null,
            numberOfTried: 0,
            executionResults: [],
            data: { id: reservation.reservationFor.id }
        };
        yield taskRepo.save(aggregateTask);
        res.status(http_status_1.NO_CONTENT)
            .end();
    }
    catch (error) {
        next(error);
    }
}));
/**
 * 予約キャンセル
 */
reservationsRouter.put('/:id/cancel', permitScopes_1.default(['admin']), validator_1.default, (req, res, next) => __awaiter(this, void 0, void 0, function* () {
    try {
        yield ttts.service.reserve.cancelReservation({ id: req.params.id })({
            reservation: new ttts.repository.Reservation(ttts.mongoose.connection),
            stock: new ttts.repository.Stock(redisClient),
            task: new ttts.repository.Task(ttts.mongoose.connection),
            ticketTypeCategoryRateLimit: new ttts.repository.rateLimit.TicketTypeCategory(redisClient)
        });
        res.status(http_status_1.NO_CONTENT)
            .end();
    }
    catch (error) {
        next(error);
    }
}));
exports.default = reservationsRouter;
