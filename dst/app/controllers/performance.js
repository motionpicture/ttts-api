"use strict";
/**
 * パフォーマンスコントローラー
 * @namespace controllers/performance
 */
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const ttts = require("@motionpicture/ttts-domain");
const createDebug = require("debug");
const moment = require("moment");
const redisClient = ttts.redis.createClient({
    host: process.env.TTTS_PERFORMANCE_STATUSES_REDIS_HOST,
    // tslint:disable-next-line:no-magic-numbers
    port: parseInt(process.env.TTTS_PERFORMANCE_STATUSES_REDIS_PORT, 10),
    password: process.env.TTTS_PERFORMANCE_STATUSES_REDIS_KEY,
    tls: { servername: process.env.TTTS_PERFORMANCE_STATUSES_REDIS_HOST }
});
const debug = createDebug('ttts-api:controller:performance');
const CATEGORY_WHEELCHAIR = '1';
const WHEELCHAIR_NUMBER_PER_HOUR = 1;
/**
 * 検索する
 *
 * @param {ISearchConditions} searchConditions 検索条件
 * @return {ISearchResult} 検索結果
 * @memberof controllers/performance
 */
// tslint:disable-next-line:max-func-body-length
function search(searchConditions) {
    return __awaiter(this, void 0, void 0, function* () {
        const performanceRepo = new ttts.repository.Performance(ttts.mongoose.connection);
        const performanceStatusesRepo = new ttts.repository.PerformanceStatuses(redisClient);
        const reservationRepo = new ttts.repository.Reservation(ttts.mongoose.connection);
        const stockRepo = new ttts.repository.Stock(ttts.mongoose.connection);
        // MongoDB検索条件を作成
        const andConditions = [
            { canceled: false }
        ];
        if (searchConditions.day !== undefined) {
            andConditions.push({ day: searchConditions.day });
        }
        if (searchConditions.theater !== undefined) {
            andConditions.push({ theater: searchConditions.theater });
        }
        if (searchConditions.screen !== undefined) {
            andConditions.push({ screen: searchConditions.screen });
        }
        if (searchConditions.performanceId !== undefined) {
            andConditions.push({ _id: searchConditions.performanceId });
        }
        if (searchConditions.startFrom !== undefined) {
            const now = moment(searchConditions.startFrom);
            // tslint:disable-next-line:no-magic-numbers
            const tomorrow = moment(searchConditions.startFrom).add(+24, 'hours');
            andConditions.push({
                $or: [
                    {
                        day: now.format('YYYYMMDD'),
                        start_time: { $gte: now.format('HHmm') }
                    },
                    {
                        day: { $gte: tomorrow.format('YYYYMMDD') }
                    }
                ]
            });
        }
        // 作品条件を追加する
        yield addFilmConditions(andConditions, (searchConditions.section !== undefined) ? searchConditions.section : null, (searchConditions.words !== undefined) ? searchConditions.words : null);
        let conditions = null;
        if (andConditions.length > 0) {
            conditions = { $and: andConditions };
        }
        debug('search conditions;', conditions);
        // 作品件数取得
        const filmIds = yield performanceRepo.performanceModel.distinct('film', conditions).exec();
        // 総数検索
        const performancesCount = yield performanceRepo.performanceModel.count(conditions).exec();
        // 必要な項目だけ指定すること(レスポンスタイムに大きく影響するので)
        const fields = 'day open_time start_time end_time film screen screen_name theater theater_name ttts_extension';
        const query = performanceRepo.performanceModel.find(conditions, fields);
        const page = (searchConditions.page !== undefined) ? searchConditions.page : 1;
        if (searchConditions.limit !== undefined) {
            query.skip(searchConditions.limit * (page - 1)).limit(searchConditions.limit);
        }
        query.populate('film', 'name sections.name minutes copyright');
        // 上映日、開始時刻
        query.setOptions({
            sort: {
                day: 1,
                start_time: 1
            }
        });
        const performances = yield query.lean(true).exec();
        debug('performances found.', performances);
        // 空席情報を追加
        const performanceStatuses = yield performanceStatusesRepo.find().catch(() => undefined);
        const getStatus = (id) => {
            if (performanceStatuses !== undefined && performanceStatuses.hasOwnProperty(id)) {
                return performanceStatuses[id];
            }
            return null;
        };
        // 車椅子対応 2017/10
        const performanceIds = performances.map((performance) => performance._id.toString());
        const wheelchairs = {};
        let requiredSeatNum = 1;
        // 車椅子予約チェック要求ありの時
        if (searchConditions.wheelchair !== undefined) {
            // 検索されたパフォーマンスに紐づく車椅子予約取得
            const conditionsWheelchair = {};
            conditionsWheelchair.status = { $in: [ttts.factory.reservationStatusType.ReservationConfirmed] };
            conditionsWheelchair.performance = { $in: performanceIds };
            conditionsWheelchair['ticket_ttts_extension.category'] = CATEGORY_WHEELCHAIR;
            if (searchConditions.day !== null) {
                conditionsWheelchair.performance_day = searchConditions.day;
            }
            const reservations = yield reservationRepo.reservationModel.find(conditionsWheelchair, 'performance').exec();
            reservations.map((reservation) => {
                const performance = reservation.performance;
                if (!wheelchairs.hasOwnProperty(performance)) {
                    wheelchairs[performance] = 1;
                }
                else {
                    wheelchairs[performance] += 1;
                }
            });
            // 券種取得
            const ticketType = yield ttts.Models.TicketType.findOne({ 'ttts_extension.category': CATEGORY_WHEELCHAIR }).exec();
            if (ticketType !== null) {
                requiredSeatNum = ticketType.ttts_extension.required_seat_num;
            }
        }
        // ツアーナンバー取得(ttts_extensionのない過去データに備えて念のため作成)
        const getTourNumber = (performance) => {
            if (performance.hasOwnProperty('ttts_extension')) {
                return performance.ttts_extension.tour_number;
            }
            return '';
        };
        // 予約可能車椅子席数取得
        const getWheelchairAvailable = (pId) => __awaiter(this, void 0, void 0, function* () {
            // 指定パフォーマンスで予約可能な車椅子チケット数取得
            const wheelchairReserved = wheelchairs.hasOwnProperty(pId) ?
                wheelchairs[pId] : 0;
            const wheelchairAvailable = WHEELCHAIR_NUMBER_PER_HOUR - wheelchairReserved > 0 ?
                WHEELCHAIR_NUMBER_PER_HOUR - wheelchairReserved : 0;
            // 指定パフォーマンスで予約可能なチケット数取得(必要座席数で割る)
            const conditionsAvailable = {
                performance: pId,
                availability: ttts.factory.itemAvailability.InStock
            };
            let reservationAvailable = yield stockRepo.stockModel.find(conditionsAvailable).count().exec();
            reservationAvailable = Math.floor(reservationAvailable / requiredSeatNum);
            // tslint:disable-next-line:no-console
            console.log(`${pId}:wheelchairReserved=${wheelchairReserved}`);
            // tslint:disable-next-line:no-console
            console.log(`wheelchairAvailable=${wheelchairAvailable}`);
            // tslint:disable-next-line:no-console
            console.log(`reservationAvailable=${reservationAvailable}`);
            // 予約可能な車椅子チケット数か予約可能なチケット数／必要座席数の小さいほうを返す
            // ※車椅子枠が"1"残っていても、チケットが"3枚"しか残っていなかったら、
            //   "4座席"必要な車椅子予約可能数は0になる。
            return Math.min(wheelchairAvailable, reservationAvailable);
        });
        //---
        // 停止単位でgrouping({"2017/11/24 08:37:33": [p1,p2,,,pn]} )
        const dicSuspended = {};
        for (const performance of performances) {
            // 販売停止の時
            if (performance.ttts_extension.online_sales_status === ttts.factory.performance.OnlineSalesStatus.Suspended) {
                // dictionnaryに追加する
                const key = performance.ttts_extension.online_sales_update_at;
                if (dicSuspended.hasOwnProperty(key) === false) {
                    dicSuspended[key] = [];
                }
                dicSuspended[key].push(performance._id.toString());
            }
        }
        // 停止単位で配列にセット
        // [{ performance_ids: [p1,p2,,,pn],
        //    annnouce_locales: { ja:'メッセージ', 'en':'message',･･･} }]
        const salesSuspended = [];
        for (const key of Object.keys(dicSuspended)) {
            salesSuspended.push({
                date: key,
                performance_ids: dicSuspended[key],
                annnouce_locales: { ja: `販売停止(${key})` }
            });
        }
        const data = yield Promise.all(performances.map((performance) => __awaiter(this, void 0, void 0, function* () {
            return {
                type: 'performances',
                id: performance._id,
                attributes: {
                    day: performance.day,
                    open_time: performance.open_time,
                    start_time: performance.start_time,
                    end_time: performance.end_time,
                    seat_status: getStatus(performance._id.toString()),
                    // theater_name: performance.theater_name,
                    // screen_name: performance.screen_name,
                    // film: performance.film._id,
                    // film_name: performance.film.name,
                    // film_sections: performance.film.sections.map((filmSection: any) => filmSection.name),
                    // film_minutes: performance.film.minutes,
                    // film_copyright: performance.film.copyright,
                    // film_image: `${process.env.FRONTEND_ENDPOINT}/images/film/${performance.film._id}.jpg`,
                    tour_number: getTourNumber(performance),
                    wheelchair_available: yield getWheelchairAvailable(performance._id.toString()),
                    online_sales_status: performance.ttts_extension.online_sales_status,
                    ev_service_status: performance.ttts_extension.ev_service_status
                }
            };
        })));
        return {
            performances: data,
            numberOfPerformances: performancesCount,
            filmIds: filmIds,
            salesSuspended: salesSuspended
        };
    });
}
exports.search = search;
/**
 * 作品に関する検索条件を追加する
 *
 * @param andConditions パフォーマンス検索条件
 * @param section 作品部門
 * @param words フリーワード
 */
function addFilmConditions(andConditions, section, words) {
    return __awaiter(this, void 0, void 0, function* () {
        const filmAndConditions = [];
        if (section !== null) {
            // 部門条件の追加
            filmAndConditions.push({ 'sections.code': { $in: [section] } });
        }
        // フリーワードの検索対象はタイトル(日英両方)
        // 空白つなぎでOR検索
        if (words !== null) {
            // trim and to half-width space
            words = words.replace(/(^\s+)|(\s+$)/g, '').replace(/\s/g, ' ');
            const orConditions = words.split(' ').filter((value) => (value.length > 0)).reduce((a, word) => {
                return a.concat({ 'name.ja': { $regex: `${word}` } }, { 'name.en': { $regex: `${word}` } });
            }, []);
            debug(orConditions);
            filmAndConditions.push({ $or: orConditions });
        }
        // 条件があれば作品検索してID条件として追加
        if (filmAndConditions.length > 0) {
            const filmIds = yield ttts.Models.Film.distinct('_id', { $and: filmAndConditions }).exec();
            debug('filmIds:', filmIds);
            // 該当作品がない場合、filmIdsが空配列となりok
            andConditions.push({ film: { $in: filmIds } });
        }
    });
}