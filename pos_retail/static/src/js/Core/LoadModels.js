/*
    This module create by: thanhchatvn@gmail.com
 */
odoo.define('pos_retail.load_models', function (require) {
    var models = require('point_of_sale.models');
    var time = require('web.time');
    var exports = {};
    var Backbone = window.Backbone;
    var bus = require('pos_retail.core_bus');
    var core = require('web.core');
    var _t = core._t;
    var session = require('web.session');
    var rpc = require('web.rpc');
    var ERROR_DELAY = 30000;

    exports.pos_sync_pricelists = Backbone.Model.extend({
        initialize: function (pos) {
            this.pos = pos;
        },
        start: function () {
            this.bus = bus.bus;
            this.bus.last = this.pos.db.load('bus_last', 0);
            this.bus.on("notification", this, this.on_notification);
            this.bus.start_polling();
        },
        reload_pricelists: function () {
            console.log('{LoadModels} reload_pricelists')
            var self = this;
            var pricelists_model = _.filter(self.pos.models, function (model) {
                return model.pricelist;
            });
            if (pricelists_model) {
                var first_load = self.pos.load_server_data_by_model(pricelists_model[0]);
                self.pricelists_model = pricelists_model;
                return first_load.then(function () {
                    var second_load = self.pos.load_server_data_by_model(self.pricelists_model[1]);
                    return second_load.then(function () {
                        var order = self.pos.get_order();
                        var pricelist = self.pos._get_active_pricelist();
                        if (order && pricelist) {
                            order.set_pricelist(pricelist);
                        }
                    })
                })
            }
        },
        on_notification: function (notifications) {
            var self = this;
            if (notifications && notifications[0] && notifications[0][1]) {
                for (var i = 0; i < notifications.length; i++) {
                    var channel = notifications[i][0][1];
                    if (channel == 'pos.sync.pricelists') {
                        this.reload_pricelists()
                    }
                }
            }
        }
    });

    models.load_models([
        {
            model: 'pos.epson',
            fields: ['name', 'ip'],
            loaded: function (self, epson_printers) {
                self.epson_printer_default = null;
                self.epson_printers = [];
                self.epson_priner_by_id = {};
                self.epson_priner_by_ip = {};
                for (var i = 0; i < epson_printers.length; i++) {
                    self.epson_priner_by_id[epson_printers[i]['id']] = epson_printers[i];
                    self.epson_priner_by_ip[epson_printers[i]['ip']] = epson_printers[i];
                }
                var printer_id = self.config.printer_id;
                if (printer_id) {
                    var epson_printer_default = _.find(epson_printers, function (epson_printer) {
                        return epson_printer.id == printer_id[0];
                    });
                    if (epson_printer_default) {
                        epson_printer_default['print_receipt'] = true;
                        self.epson_printer_default = epson_printer_default;
                        self.epson_printers.push(epson_printer_default);
                    }
                }
            },
        },
        {
            model: 'pos.service.charge',
            fields: ['name', 'product_id', 'type', 'amount'],
            condition: function (self) {
                return self.config.service_charge_ids && self.config.service_charge_ids.length;
            },
            domain: function (self) {
                return [
                    ['id', 'in', self.config.service_charge_ids],
                ]
            },
            loaded: function (self, services_charge) {
                self.services_charge = services_charge;
                self.services_charge_ids = [];
                self.service_charge_by_id = {};
                for (var i = 0; i < services_charge.length; i++) {
                    var service = services_charge[i];
                    self.services_charge_ids.push(service.id);
                    self.service_charge_by_id[service.id] = service;
                }
            }
        },
        {
            model: 'pos.promotion',
            fields: [
                'name',
                'start_date',
                'end_date',
                'type',
                'product_id',
                'discount_lowest_price',
                'product_ids',
                'minimum_items',
                'discount_first_order',
                'special_customer_ids',
                'promotion_birthday',
                'promotion_birthday_type',
                'promotion_group',
                'promotion_group_ids',
                'pos_branch_ids',
                'monday',
                'tuesday',
                'wednesday',
                'thursday',
                'friday',
                'saturday',
                'sunday',
                'from_time',
                'to_time',
                'special_days',
                'special_times',
                'method',
                'amount_total'
            ],
            domain: function (self) {
                // Todo: load all promotions have added on pos setting
                var domains = [
                    ['state', '=', 'active'],
                    ['start_date', '<=', time.date_to_str(new Date()) + " " + time.time_to_str(new Date())],
                    ['end_date', '>=', time.date_to_str(new Date()) + " " + time.time_to_str(new Date())],
                    ['id', 'in', self.config.promotion_ids]
                ];
                return domains
            },
            promotion: true,
            loaded: function (self, promotions) {
                var promotion_applied = [];
                for (var i = 0; i < promotions.length; i++) {
                    var promotion = promotions[i];
                    if (self.config.pos_branch_id) {  // TODO case 1: if pos setting have set branch
                        if (!promotion.pos_branch_ids.length) {
                            promotion_applied.push(promotion);
                            continue
                        }
                        if (promotion.pos_branch_ids.indexOf(self.config.pos_branch_id[0]) != -1) {
                            promotion_applied.push(promotion);
                            continue
                        }
                    } else { // TODO case 2: if pos setting not set branch
                        if (promotion.pos_branch_ids.length == 0) {
                            promotion_applied.push(promotion);
                        }
                    }
                }
                self.promotions = promotion_applied;
                self.promotion_by_id = {};
                self.promotion_ids = [];
                var i = 0;
                while (i < promotions.length) {
                    self.promotion_by_id[promotions[i].id] = promotions[i];
                    self.promotion_ids.push(promotions[i].id);
                    i++;
                }
            }
        }, {
            model: 'pos.promotion.discount.order',
            fields: ['minimum_amount', 'discount', 'promotion_id'],
            condition: function (self) {
                return self.promotion_ids && self.promotion_ids.length > 0;
            },
            domain: function (self) {
                return [['promotion_id', 'in', self.promotion_ids]]
            },
            promotion: true,
            loaded: function (self, discounts) {
                self.promotion_discount_order_by_id = {};
                self.promotion_discount_order_by_promotion_id = {};
                var i = 0;
                while (i < discounts.length) {
                    self.promotion_discount_order_by_id[discounts[i].id] = discounts[i];
                    if (!self.promotion_discount_order_by_promotion_id[discounts[i].promotion_id[0]]) {
                        self.promotion_discount_order_by_promotion_id[discounts[i].promotion_id[0]] = [discounts[i]]
                    } else {
                        self.promotion_discount_order_by_promotion_id[discounts[i].promotion_id[0]].push(discounts[i])
                    }
                    i++;
                }
            }
        }, {
            model: 'pos.promotion.discount.category',
            fields: ['category_id', 'discount', 'promotion_id'],
            condition: function (self) {
                return self.promotion_ids && self.promotion_ids.length > 0;
            },
            domain: function (self) {
                return [['promotion_id', 'in', self.promotion_ids]]
            },
            promotion: true,
            loaded: function (self, discounts_category) {
                self.promotion_by_category_id = {};
                var i = 0;
                while (i < discounts_category.length) {
                    self.promotion_by_category_id[discounts_category[i].category_id[0]] = discounts_category[i];
                    i++;
                }
            }
        }, {
            model: 'pos.promotion.discount.quantity',
            fields: ['product_id', 'quantity', 'discount', 'promotion_id'],
            condition: function (self) {
                return self.promotion_ids && self.promotion_ids.length > 0;
            },
            domain: function (self) {
                return [['promotion_id', 'in', self.promotion_ids]]
            },
            promotion: true,
            loaded: function (self, discounts_quantity) {
                self.promotion_quantity_by_product_id = {};
                var i = 0;
                while (i < discounts_quantity.length) {
                    if (!self.promotion_quantity_by_product_id[discounts_quantity[i].product_id[0]]) {
                        self.promotion_quantity_by_product_id[discounts_quantity[i].product_id[0]] = [discounts_quantity[i]]
                    } else {
                        self.promotion_quantity_by_product_id[discounts_quantity[i].product_id[0]].push(discounts_quantity[i])
                    }
                    i++;
                }
            }
        }, {
            model: 'pos.promotion.gift.condition',
            fields: ['product_id', 'minimum_quantity', 'promotion_id'],
            condition: function (self) {
                return self.promotion_ids && self.promotion_ids.length > 0;
            },
            domain: function (self) {
                return [['promotion_id', 'in', self.promotion_ids]]
            },
            promotion: true,
            loaded: function (self, gift_conditions) {
                self.promotion_gift_condition_by_promotion_id = {};
                var i = 0;
                while (i < gift_conditions.length) {
                    if (!self.promotion_gift_condition_by_promotion_id[gift_conditions[i].promotion_id[0]]) {
                        self.promotion_gift_condition_by_promotion_id[gift_conditions[i].promotion_id[0]] = [gift_conditions[i]]
                    } else {
                        self.promotion_gift_condition_by_promotion_id[gift_conditions[i].promotion_id[0]].push(gift_conditions[i])
                    }
                    i++;
                }
            }
        }, {
            model: 'pos.promotion.gift.free',
            fields: ['product_id', 'quantity_free', 'promotion_id', 'type'],
            condition: function (self) {
                return self.promotion_ids && self.promotion_ids.length > 0;
            },
            domain: function (self) {
                return [['promotion_id', 'in', self.promotion_ids]]
            },
            promotion: true,
            loaded: function (self, gifts_free) {
                self.promotion_gift_free_by_promotion_id = {};
                var i = 0;
                while (i < gifts_free.length) {
                    if (!self.promotion_gift_free_by_promotion_id[gifts_free[i].promotion_id[0]]) {
                        self.promotion_gift_free_by_promotion_id[gifts_free[i].promotion_id[0]] = [gifts_free[i]]
                    } else {
                        self.promotion_gift_free_by_promotion_id[gifts_free[i].promotion_id[0]].push(gifts_free[i])
                    }
                    i++;
                }
            }
        }, {
            model: 'pos.promotion.discount.condition',
            fields: ['product_id', 'minimum_quantity', 'promotion_id'],
            condition: function (self) {
                return self.promotion_ids && self.promotion_ids.length > 0;
            },
            domain: function (self) {
                return [['promotion_id', 'in', self.promotion_ids]]
            },
            promotion: true,
            loaded: function (self, discount_conditions) {
                self.promotion_discount_condition_by_promotion_id = {};
                var i = 0;
                while (i < discount_conditions.length) {
                    if (!self.promotion_discount_condition_by_promotion_id[discount_conditions[i].promotion_id[0]]) {
                        self.promotion_discount_condition_by_promotion_id[discount_conditions[i].promotion_id[0]] = [discount_conditions[i]]
                    } else {
                        self.promotion_discount_condition_by_promotion_id[discount_conditions[i].promotion_id[0]].push(discount_conditions[i])
                    }
                    i++;
                }
            }
        }, {
            model: 'pos.promotion.discount.apply',
            fields: ['product_id', 'discount', 'promotion_id', 'type'],
            condition: function (self) {
                return self.promotion_ids && self.promotion_ids.length > 0;
            },
            domain: function (self) {
                return [['promotion_id', 'in', self.promotion_ids]]
            },
            promotion: true,
            loaded: function (self, discounts_apply) {
                self.promotion_discount_apply_by_promotion_id = {};
                var i = 0;
                while (i < discounts_apply.length) {
                    if (!self.promotion_discount_apply_by_promotion_id[discounts_apply[i].promotion_id[0]]) {
                        self.promotion_discount_apply_by_promotion_id[discounts_apply[i].promotion_id[0]] = [discounts_apply[i]]
                    } else {
                        self.promotion_discount_apply_by_promotion_id[discounts_apply[i].promotion_id[0]].push(discounts_apply[i])
                    }
                    i++;
                }
            }
        }, {
            model: 'pos.promotion.price',
            fields: ['product_id', 'minimum_quantity', 'price_down', 'promotion_id'],
            condition: function (self) {
                return self.promotion_ids && self.promotion_ids.length > 0;
            },
            domain: function (self) {
                return [['promotion_id', 'in', self.promotion_ids]]
            },
            promotion: true,
            loaded: function (self, prices) {
                self.promotion_price_by_promotion_id = {};
                var i = 0;
                while (i < prices.length) {
                    if (!self.promotion_price_by_promotion_id[prices[i].promotion_id[0]]) {
                        self.promotion_price_by_promotion_id[prices[i].promotion_id[0]] = [prices[i]]
                    } else {
                        self.promotion_price_by_promotion_id[prices[i].promotion_id[0]].push(prices[i])
                    }
                    i++;
                }
            }
        }, {
            model: 'pos.promotion.special.category',
            fields: ['category_id', 'type', 'count', 'discount', 'promotion_id', 'product_id', 'qty_free'],
            condition: function (self) {
                return self.promotion_ids && self.promotion_ids.length > 0;
            },
            domain: function (self) {
                return [['promotion_id', 'in', self.promotion_ids]]
            },
            promotion: true,
            loaded: function (self, promotion_lines) {
                self.promotion_special_category_by_promotion_id = {};
                var i = 0;
                while (i < promotion_lines.length) {
                    if (!self.promotion_special_category_by_promotion_id[promotion_lines[i].promotion_id[0]]) {
                        self.promotion_special_category_by_promotion_id[promotion_lines[i].promotion_id[0]] = [promotion_lines[i]]
                    } else {
                        self.promotion_special_category_by_promotion_id[promotion_lines[i].promotion_id[0]].push(promotion_lines[i])
                    }
                    i++;
                }
            }
        }, {
            model: 'pos.promotion.multi.buy',
            fields: ['promotion_id', 'product_ids', 'list_price', 'qty_apply'],
            condition: function (self) {
                return self.promotion_ids && self.promotion_ids.length > 0;
            },
            domain: function (self) {
                return [['promotion_id', 'in', self.promotion_ids]]
            },
            promotion: true,
            loaded: function (self, multi_buy) {
                self.multi_buy = multi_buy;
                self.multi_buy_by_promotion_id = {};
                for (var i = 0; i < multi_buy.length; i++) {
                    var rule = multi_buy[i];
                    if (!self.multi_buy_by_promotion_id[rule.promotion_id[0]]) {
                        self.multi_buy_by_promotion_id[rule.promotion_id[0]] = [rule]
                    } else {
                        self.multi_buy_by_promotion_id[rule.promotion_id[0]].push(rule);
                    }
                }
            }
        },
        {
            model: 'pos.loyalty',
            fields: ['name', 'product_loyalty_id', 'rounding', 'rounding_down'],
            condition: function (self) {
                return self.config.pos_loyalty_id;
            },
            domain: function (self) {
                return [
                    ['id', '=', self.config.pos_loyalty_id[0]],
                    ['state', '=', 'running'],
                ]
            },
            loaded: function (self, loyalties) {
                if (loyalties.length > 0) {
                    self.loyalty = loyalties[0];
                } else {
                    self.loyalty = false;
                }
            }
        }, {
            model: 'pos.loyalty.rule',
            fields: [
                'name',
                'loyalty_id',
                'coefficient',
                'type',
                'product_ids',
                'category_ids',
                'min_amount'
            ],
            condition: function (self) {
                return self.loyalty != undefined;
            },
            domain: function (self) {
                return [['loyalty_id', '=', self.loyalty.id], ['state', '=', 'running']];
            },
            loaded: function (self, rules) {
                self.rules = rules;
                self.rule_ids = [];
                self.rule_by_id = {};
                self.rules_by_loyalty_id = {};
                for (var i = 0; i < rules.length; i++) {
                    self.rule_by_id[rules[i].id] = rules[i];
                    self.rule_ids.push(rules[i].id)
                    if (!self.rules_by_loyalty_id[rules[i].loyalty_id[0]]) {
                        self.rules_by_loyalty_id[rules[i].loyalty_id[0]] = [rules[i]];
                    } else {
                        self.rules_by_loyalty_id[rules[i].loyalty_id[0]].push(rules[i]);
                    }
                }
            }
        }, {
            model: 'pos.loyalty.reward',
            fields: [
                'name',
                'loyalty_id',
                'redeem_point',
                'type',
                'coefficient',
                'discount',
                'discount_product_ids',
                'discount_category_ids',
                'min_amount',
                'gift_product_ids',
                'resale_product_ids',
                'gift_quantity',
                'price_resale'
            ],
            condition: function (self) {
                return self.loyalty;
            },
            domain: function (self) {
                return [['loyalty_id', '=', self.loyalty.id], ['state', '=', 'running']]
            },
            loaded: function (self, rewards) {
                self.rewards = rewards;
                self.reward_by_id = {};
                self.rewards_by_loyalty_id = {};
                for (var i = 0; i < rewards.length; i++) {
                    self.reward_by_id[rewards[i].id] = rewards[i];
                    if (!self.rewards_by_loyalty_id[rewards[i].loyalty_id[0]]) {
                        self.rewards_by_loyalty_id[rewards[i].loyalty_id[0]] = [rewards[i]];
                    } else {
                        self.rewards_by_loyalty_id[rewards[i].loyalty_id[0]].push([rewards[i]]);
                    }
                }
            }
        },
        {
            label: 'Stock Picking Type',
            model: 'stock.picking.type',
            fields: ['name', 'code', 'default_location_dest_id', 'default_location_src_id', 'display_name'],
            domain: function (self) {
                return ['|', ['id', '=', self.config.picking_type_id[0]], ['id', 'in', self.config.multi_stock_operation_type_ids]];
            },
            loaded: function (self, stock_picking_types) {
                self.default_location_src_of_picking_type_ids = [];
                self.stock_picking_type_by_id = {};
                for (var i = 0; i < stock_picking_types.length; i++) {
                    let picking_type = stock_picking_types[i];
                    if (picking_type.warehouse_id) {
                        picking_type['name'] = picking_type.warehouse_id[1] + ' / ' + picking_type['name']
                    }
                    self.stock_picking_type_by_id[picking_type['id']] = picking_type;
                    if (!self.default_location_src_of_picking_type_ids.includes() && picking_type.default_location_src_id) {
                        self.default_location_src_of_picking_type_ids.push(picking_type.default_location_src_id[0])
                    }
                }
                self.stock_picking_types = stock_picking_types;
            }
        },
        {
            model: 'stock.location',
            fields: ['name', 'location_id', 'company_id', 'usage', 'barcode', 'display_name'],
            domain: function (self) {
                return ['|', '|', ['id', 'in', self.config.stock_location_ids], ['id', '=', self.config.stock_location_id[0]], ['id', 'in', self.default_location_src_of_picking_type_ids]];
            },
            loaded: function (self, stock_locations) {
                self.stock_locations = stock_locations;
                self.stock_location_by_id = {};
                self.stock_location_ids = [];
                for (var i = 0; i < stock_locations.length; i++) {
                    var stock_location = stock_locations[i];
                    self.stock_location_by_id[stock_location['id']] = stock_location;
                    if (stock_location.usage == 'internal') {
                        self.stock_location_ids.push(stock_location['id'])
                    }
                }
            },
        },
        {
            label: 'Product Barcode',
            model: 'product.barcode',
            fields: ['product_tmpl_id', 'pricelist_id', 'uom_id', 'barcode', 'product_id'],
            domain: [],
            loaded: function (self, barcodes) {
                self.barcodes = barcodes;
                self.barcodes_by_barcode = {};
                self.barcodes_by_product_id = {};
                for (var i = 0; i < barcodes.length; i++) {
                    var barcode = barcodes[i];
                    if (!barcode['product_id']) {
                        continue
                    }
                    if (!self.barcodes_by_barcode[barcode['barcode']]) {
                        self.barcodes_by_barcode[barcode['barcode']] = [barcode];
                    } else {
                        self.barcodes_by_barcode[barcode['barcode']].push(barcode);
                    }
                    if (!self.barcodes_by_product_id[barcode['product_id'][0]]) {
                        self.barcodes_by_product_id[barcode['product_id'][0]] = [barcode];
                    } else {
                        self.barcodes_by_product_id[barcode['product_id'][0]].push(barcode);
                    }
                }
            }
        },
        {
            label: 'Packaging',
            model: 'product.packaging',
            fields: ['name', 'barcode', 'list_price', 'product_id', 'qty', 'sequence'],
            domain: function (self) {
                return [['active', '=', true]]
            },
            loaded: function (self, packagings) {
                self.packagings = packagings;
                self.packaging_by_product_id = {};
                self.packaging_by_id = {};
                self.packaging_barcode_by_product_id = {};
                for (var i = 0; i < packagings.length; i++) {
                    var packaging = packagings[i];
                    self.packaging_by_id[packaging.id] = packaging;
                    if (!self.packaging_by_product_id[packaging.product_id[0]]) {
                        self.packaging_by_product_id[packaging.product_id[0]] = [packaging]
                    } else {
                        self.packaging_by_product_id[packaging.product_id[0]].push(packaging)
                    }
                    if (!packaging.barcode) {
                        continue
                    }
                    if (!self.packaging_barcode_by_product_id[packaging.product_id[0]]) {
                        self.packaging_barcode_by_product_id[packaging.product_id[0]] = [packaging]
                    } else {
                        self.packaging_barcode_by_product_id[packaging.product_id[0]].push(packaging)
                    }
                }

            }
        },
    ], {
        after: 'pos.config'
    });

    var extend_models = [
        {
            label: 'Multi Currency',
            model: 'res.currency',
            fields: [],
            domain: function (self) {
                return ['|', ['id', 'in', self.pricelist_currency_ids], ['id', '=', self.currency.id]]
            },
            loaded: function (self, currencies) {
                self.currency_by_id = {};
                var i = 0;
                while (i < currencies.length) {
                    var currency = currencies[i];
                    currency['decimals'] = Math.ceil(Math.log(1.0 / currency.rounding) / Math.log(10));
                    self.currency_by_id[currencies[i].id] = currencies[i];
                    i++
                }
                self.currencies = currencies;
            }
        },
        {
            model: 'res.partner.group',
            fields: ['name', 'image', 'pricelist_applied', 'pricelist_id', 'height', 'width'],
            loaded: function (self, membership_groups) {
                self.membership_groups = membership_groups;
                self.membership_group_by_id = {};
                for (var i = 0; i < membership_groups.length; i++) {
                    var membership_group = membership_groups[i];
                    self.membership_group_by_id[membership_group.id] = membership_group;
                }
            },
            retail: true,
        },
        {
            label: 'Units of Measure',
            model: 'uom.uom',
            fields: [],
            domain: [],
            loaded: function (self, uoms) {
                self.uom_by_id = {};
                for (var i = 0; i < uoms.length; i++) {
                    var uom = uoms[i];
                    self.uom_by_id[uom.id] = uom;
                }
            }
        },
        {
            label: 'Sellers',
            model: 'res.users',
            fields: ['display_name', 'name', 'pos_security_pin', 'barcode', 'pos_config_id', 'partner_id', 'image_1920'],
            context: {sudo: true},
            loaded: function (self, users) {
                // TODO: have 2 case
                // TODO 1) If have set default_seller_id, default seller is default_seller_id
                // TODO 2) If have NOT set default_seller_id, default seller is pos_session.user_id
                self.users = users;
                self.user_by_id = {};
                self.user_by_pos_security_pin = {};
                self.user_by_barcode = {};
                self.default_seller = null;
                self.sellers = [];
                for (var i = 0; i < users.length; i++) {
                    var user = users[i];
                    if (user['pos_security_pin']) {
                        self.user_by_pos_security_pin[user['pos_security_pin']] = user;
                    }
                    if (user['barcode']) {
                        self.user_by_barcode[user['barcode']] = user;
                    }
                    self.user_by_id[user['id']] = user;
                    if (self.config.default_seller_id && self.config.default_seller_id[0] == user['id']) {
                        self.default_seller = user;
                    }
                    if (self.config.seller_ids.indexOf(user['id']) != -1) {
                        self.sellers.push(user)
                    }
                }
                if (!self.default_seller) { // TODO: if have not POS Config / default_seller_id: we set default_seller is user of pos session
                    var pos_session_user_id = self.pos_session.user_id[0];
                    if (self.user_by_id[pos_session_user_id]) {
                        self.default_seller = self.user_by_id[pos_session_user_id]
                    }
                }
            }
        },
        {
            model: 'pos.tag',
            fields: ['name', 'is_return_reason', 'color'],
            domain: [],
            loaded: function (self, tags) {
                self.tags = tags;
                self.tag_by_id = {};
                self.cancel_reasons = []
                self.return_reasons = [];
                var i = 0;
                while (i < tags.length) {
                    let tag = tags[i];
                    self.tag_by_id[tag.id] = tag;
                    if (tag.is_return_reason) {
                        self.return_reasons.push(tag)
                    }
                    if (self.config.reason_cancel_reason_ids.indexOf(tag.id) != -1) {
                        self.cancel_reasons.push(tag)
                    }
                    i++;
                }

            }
        }, {
            model: 'pos.note',
            fields: ['name'],
            loaded: function (self, notes) {
                self.notes = notes;
                self.note_by_id = {};
                var i = 0;
                while (i < notes.length) {
                    self.note_by_id[notes[i].id] = notes[i];
                    i++;
                }
            }
        }, {
            model: 'pos.combo.item',
            fields: ['product_id', 'product_combo_id', 'default', 'quantity', 'uom_id', 'tracking', 'required', 'price_extra'],
            domain: [],
            loaded: function (self, combo_items) {
                self.combo_items = combo_items;
                self.combo_item_by_id = {};
                for (var i = 0; i < combo_items.length; i++) {
                    var item = combo_items[i];
                    self.combo_item_by_id[item.id] = item;
                }
            }
        }, {
            model: 'product.generic.option',
            fields: ['product_ids', 'name', 'price_extra'],
            condition: function (self) {
                return self.config.product_generic_option;
            },
            domain: [],
            loaded: function (self, generic_options) {
                self.generic_options = generic_options;
                self.generic_option_by_id = {};
                for (var i = 0; i < generic_options.length; i++) {
                    var generic_option = generic_options[i];
                    self.generic_option_by_id[generic_option.id] = generic_option;
                }
                self.db.save_generic_options(generic_options);
            }
        },
        {
            label: 'Stock Production Lot',
            model: 'stock.production.lot',
            fields: ['name', 'ref', 'product_id', 'product_uom_id', 'create_date', 'product_qty', 'barcode', 'replace_product_public_price', 'public_price'],
            lot: true,
            domain: function (self) {
                return [
                    '|', ['expiration_date', '>=', time.date_to_str(new Date()) + " " + time.time_to_str(new Date())], ['expiration_date', '=', null]
                ]
            },
            loaded: function (self, lots) {
                self.lots = lots;
                self.lot_by_name = {};
                self.lot_by_id = {};
                self.lot_by_product_id = {};
                for (var i = 0; i < self.lots.length; i++) {
                    var lot = self.lots[i];
                    self.lot_by_name[lot['name']] = lot;
                    self.lot_by_id[lot['id']] = lot;
                    if (!self.lot_by_product_id[lot.product_id[0]]) {
                        self.lot_by_product_id[lot.product_id[0]] = [lot];
                    } else {
                        self.lot_by_product_id[lot.product_id[0]].push(lot);
                    }
                }
            }
        },
        {
            label: 'Global Discount',
            model: 'pos.global.discount',
            fields: ['name', 'amount', 'product_id', 'reason', 'type', 'branch_ids'],
            domain: function (self) {
                return [['id', 'in', self.config.discount_ids]];
            },
            condition: function (self) {
                return self.config.discount && self.config.discount_ids.length > 0;
            },
            loaded: function (self, discounts) {
                discounts = _.filter(discounts, function (discount) {
                    return discount.branch_ids.length == 0 || (self.config.pos_branch_id && discount.branch_ids && discount.branch_ids.indexOf(self.config.pos_branch_id[0]) != -1)
                });
                self.discounts = discounts;
                self.discount_by_id = {};
                var i = 0;
                while (i < discounts.length) {
                    self.discount_by_id[discounts[i].id] = discounts[i];
                    i++;
                }
            }
        },
        {
            label: 'Price by Unit',
            model: 'product.uom.price',
            fields: [],
            domain: [],
            loaded: function (self, uoms_prices) {
                self.uom_price_by_uom_id = {};
                self.uoms_prices_by_product_tmpl_id = {};
                self.uoms_prices = uoms_prices;
                for (var i = 0; i < uoms_prices.length; i++) {
                    var item = uoms_prices[i];
                    if (item.product_tmpl_id) {
                        self.uom_price_by_uom_id[item.uom_id[0]] = item;
                        if (!self.uoms_prices_by_product_tmpl_id[item.product_tmpl_id[0]]) {
                            self.uoms_prices_by_product_tmpl_id[item.product_tmpl_id[0]] = [item]
                        } else {
                            self.uoms_prices_by_product_tmpl_id[item.product_tmpl_id[0]].push(item)
                        }
                    }
                }
            }
        },
        {
            label: 'Product Variants',
            model: 'product.variant',
            fields: ['product_tmpl_id', 'attribute_id', 'value_id', 'price_extra', 'product_id', 'quantity', 'uom_id'],
            domain: function (self) {
                return [['active', '=', true]];
            },
            loaded: function (self, variants) {
                self.variants = variants;
                self.variant_by_product_tmpl_id = {};
                self.variant_by_id = {};
                for (var i = 0; i < variants.length; i++) {
                    var variant = variants[i];
                    variant.display_name = variant.attribute_id[1] + ' / ' + variant.value_id[1];
                    self.variant_by_id[variant.id] = variant;
                    if (!self.variant_by_product_tmpl_id[variant['product_tmpl_id'][0]]) {
                        self.variant_by_product_tmpl_id[variant['product_tmpl_id'][0]] = [variant]
                    } else {
                        self.variant_by_product_tmpl_id[variant['product_tmpl_id'][0]].push(variant)
                    }
                }
            }
        },
        {
            label: 'Product Attributes',
            model: 'product.attribute',
            fields: ['name', 'multi_choice'],
            domain: function (self) {
                return [];
            },
            loaded: function (self, attributes) {
                self.product_attributes = attributes;
                self.product_attribute_by_id = {};
                for (var i = 0; i < attributes.length; i++) {
                    var attribute = attributes[i];
                    self.product_attribute_by_id[attribute.id] = attribute;
                }
            }
        },
        {
            label: 'Suggest Cash Amount Payment',
            model: 'pos.quickly.payment',
            fields: ['name', 'amount', 'type'],
            condition: function (self) {
                return self.config.payment_coin;
            },
            domain: function (self) {
                return [['id', 'in', self.config.payment_coin_ids]]
            },
            context: {'pos': true},
            loaded: function (self, payment_coins) {
                self.payment_coins = payment_coins;
            }
        },
        {
            model: 'account.payment.term',
            fields: ['name'],
            domain: [],
            context: {'pos': true},
            loaded: function (self, payments_term) {
                self.payments_term = payments_term;
            }
        }, {
            model: 'product.cross',
            fields: ['product_id', 'list_price', 'quantity', 'discount_type', 'discount', 'product_tmpl_id'],
            domain: [],
            loaded: function (self, cross_items) {
                self.cross_items = cross_items;
                self.cross_item_by_id = {};
                self.cross_items_by_product_tmpl_id = {}
                for (var i = 0; i < cross_items.length; i++) {
                    let item = cross_items[i];
                    item.display_name = item.product_id[1];
                    item.display_name += _t(', Discount type: ') + item.discount_type
                    item.display_name += _t(', Discount value: ') + item.discount
                    self.cross_item_by_id[item['id']] = item;
                    if (!self.cross_items_by_product_tmpl_id[item.product_tmpl_id[0]]) {
                        self.cross_items_by_product_tmpl_id[item.product_tmpl_id[0]] = [item]
                    } else {
                        self.cross_items_by_product_tmpl_id[item.product_tmpl_id[0]].push(item)
                    }
                }
            }
        },{
            model: 'pos.config',
            fields: [],
            domain: function (self) {
                return []
            },
            loaded: function (self, configs) {
                self.config_by_id = {};
                self.configs = configs;
                for (var i = 0; i < configs.length; i++) {
                    var config = configs[i];
                    self.config_by_id[config['id']] = config;
                    if (self.config['id'] == config['id'] && config.logo) {
                        self.config.logo_shop = 'data:image/png;base64,' + config.logo
                    }
                }
                if (self.config_id) {
                    var config = _.find(configs, function (config) {
                        return config['id'] == self.config_id
                    });
                    if (config) {
                        var user = self.user_by_id[config.user_id[0]]
                        if (user) {
                            self.set_cashier(user);
                        }
                    }
                }
                let restaurant_order_config = configs.find(f=> f.restaurant_order)
                self.restaurant_order_config = restaurant_order_config
            }
        },
        {
            label: 'Product Template Attribute Value',
            model: 'product.template.attribute.value',
            fields: [],
            loaded: function (self, attribute_values) {
                self.attribute_value_by_id = {};
                for (var i = 0; i < attribute_values.length; i++) {
                    var attribute_value = attribute_values[i];
                    self.attribute_value_by_id[attribute_value.id] = attribute_value;
                }
            }
        },
        {
            label: 'Journals',
            model: 'account.journal', // TODO: loading journal and linked pos_method_type to payment_methods variable of posmodel
            fields: ['name', 'code', 'pos_method_type', 'profit_account_id', 'loss_account_id', 'currency_id', 'decimal_rounding', 'inbound_payment_method_ids', 'outbound_payment_method_ids'],
            domain: function (self) {
                return ['|', '|', '|', ['id', 'in', self.config.payment_journal_ids], ['type', '=', 'bank'], ['type', '=', 'cash'], ['company_id', '=', self.company.id]]
            },
            loaded: function (self, account_journals) {
                self.payment_journals = [];
                self.account_journals = account_journals;
                self.normal_payment_methods = []
                self.journal_by_id = {};
                for (var i = 0; i < account_journals.length; i++) {
                    var account_journal = account_journals[i];
                    self.journal_by_id[account_journal.id] = account_journal;
                    if (!account_journal.currency_id) {
                        account_journal.currency_id = self.config.currency_id;
                    }
                    if (self.config.payment_journal_ids.indexOf(account_journal.id) != -1) {
                        self.payment_journals.push(account_journal)
                    }
                }
                if (self.payment_methods) {
                    for (var i = 0; i < self.payment_methods.length; i++) {
                        var payment_method = self.payment_methods[i];
                        if (payment_method.cash_journal_id) {
                            payment_method.journal = self.journal_by_id[payment_method.cash_journal_id[0]];
                            payment_method.pos_method_type = payment_method.journal['pos_method_type']
                            if (payment_method.pos_method_type == 'default') {
                                self.normal_payment_methods.push(payment_method)
                            }
                        }
                    }
                }
            }
        },
        {
            label: 'Bill Of Material',
            model: 'mrp.bom',
            fields: ['product_tmpl_id', 'product_id', 'code'],
            condition: function (self) {
                return self.config.mrp == true;
            },
            domain: function (self) {
                return [['product_id', '!=', null]]
            },
            context: {'pos': true},
            loaded: function (self, boms) {
                self.boms = boms;
                self.bom_ids = [];
                self.bom_by_id = {};
                self.bom_by_product_id = {};
                for (var i = 0; i < boms.length; i++) {
                    var bom = boms[i];
                    bom['bom_line_ids'] = [];
                    self.bom_ids.push(bom.id)
                    self.bom_by_id[bom.id] = bom
                    if (!self.bom_by_product_id[bom.product_id[0]]) {
                        self.bom_by_product_id[bom.product_id[0]] = [bom]
                    } else {
                        self.bom_by_product_id[bom.product_id[0]].push(bom)
                    }
                }
            }
        },
        {
            label: 'Bill Of Material Lines',
            model: 'mrp.bom.line',
            fields: ['product_qty', 'product_id', 'bom_id', 'price_extra'],
            condition: function (self) {
                return self.config.mrp == true;
            },
            domain: function (self) {
                return [['bom_id', 'in', self.bom_ids]]
            },
            context: {'pos': true},
            loaded: function (self, bom_lines) {
                self.bom_line_by_id = {};
                for (var i = 0; i < bom_lines.length; i++) {
                    var bom_line = bom_lines[i];
                    if (self.bom_by_id[bom_line.bom_id[0]]) {
                        var bom = self.bom_by_id[bom_line.bom_id[0]];
                        bom['bom_line_ids'].push(bom_line)
                    }
                    self.bom_line_by_id[bom_line.id] = bom_line;
                }
            }
        },
        {
            label: 'Vouchers',
            model: 'pos.voucher', // load vouchers
            fields: ['code', 'value', 'apply_type', 'method', 'use_date', 'number'],
            domain: [['state', '=', 'active']],
            context: {'pos': true},
            loaded: function (self, vouchers) {
                self.vouchers = vouchers;
                self.voucher_by_id = {};
                for (var x = 0; x < vouchers.length; x++) {
                    self.voucher_by_id[vouchers[x].id] = vouchers[x];
                }
            }
        },
        {
            label: 'Product Price by Quantity',
            model: 'product.price.quantity', // product price quantity
            fields: ['quantity', 'price_unit', 'product_tmpl_id'],
            loaded: function (self, records) {
                self.price_each_qty_by_product_tmpl_id = {};
                for (var i = 0; i < records.length; i++) {
                    var record = records[i];
                    var product_tmpl_id = record['product_tmpl_id'][0];
                    if (!self.price_each_qty_by_product_tmpl_id[product_tmpl_id]) {
                        self.price_each_qty_by_product_tmpl_id[product_tmpl_id] = [record];
                    } else {
                        self.price_each_qty_by_product_tmpl_id[product_tmpl_id].push(record);
                    }
                }
            }
        },
        {
            label: 'Stock Picking',
            model: 'stock.picking',
            fields: ['id', 'pos_order_id'],
            condition: function (self) {
                return self.config.pos_orders_management;
            },
            domain: [['is_picking_combo', '=', true], ['pos_order_id', '!=', null]],
            loaded: function (self, combo_pickings) {
                self.combo_pickings = combo_pickings;
                self.combo_picking_by_order_id = {};
                self.combo_picking_ids = [];
                for (var i = 0; i < combo_pickings.length; i++) {
                    var combo_picking = combo_pickings[i];
                    self.combo_picking_by_order_id[combo_picking.pos_order_id[0]] = combo_picking.id;
                    self.combo_picking_ids.push(combo_picking.id)
                }
            }
        },
        {
            label: 'Stock Move',
            model: 'stock.move',
            fields: ['combo_item_id', 'picking_id', 'product_id', 'product_uom_qty'],
            condition: function (self) {
                return self.config.pos_orders_management;
            },
            domain: function (self) {
                return [['picking_id', 'in', self.combo_picking_ids]]
            },
            loaded: function (self, moves) {
                self.stock_moves_by_picking_id = {};
                for (var i = 0; i < moves.length; i++) {
                    var move = moves[i];
                    if (!self.stock_moves_by_picking_id[move.picking_id[0]]) {
                        self.stock_moves_by_picking_id[move.picking_id[0]] = [move]
                    } else {
                        self.stock_moves_by_picking_id[move.picking_id[0]].push(move)
                    }
                }
            }
        },
        {
            label: 'Partner Titles',
            model: 'res.partner.title',
            condition: function (self) {
                return !self.config.hide_title
            },
            fields: ['name'],
            loaded: function (self, partner_titles) {
                self.partner_titles = partner_titles;
                self.partner_title_by_id = {};
                for (var i = 0; i < partner_titles.length; i++) {
                    var title = partner_titles[i];
                    self.partner_title_by_id[title.id] = title;
                }
            }
        },
        {
            label: 'Combo Items Limited',
            model: 'pos.combo.limit',
            fields: ['product_tmpl_id', 'pos_categ_id', 'quantity_limited', 'default_product_ids'],
            loaded: function (self, combo_limiteds) {
                self.combo_limiteds = combo_limiteds;
                self.combo_limiteds_by_product_tmpl_id = {};
                self.combo_category_limited_by_product_tmpl_id = {};
                for (var i = 0; i < combo_limiteds.length; i++) {
                    var combo_limited = combo_limiteds[i];
                    if (self.combo_limiteds_by_product_tmpl_id[combo_limited.product_tmpl_id[0]]) {
                        self.combo_limiteds_by_product_tmpl_id[combo_limited.product_tmpl_id[0]].push(combo_limited);
                    } else {
                        self.combo_limiteds_by_product_tmpl_id[combo_limited.product_tmpl_id[0]] = [combo_limited];
                    }
                    if (!self.combo_category_limited_by_product_tmpl_id[combo_limited.product_tmpl_id[0]]) {
                        self.combo_category_limited_by_product_tmpl_id[combo_limited.product_tmpl_id[0]] = {};
                        self.combo_category_limited_by_product_tmpl_id[combo_limited.product_tmpl_id[0]][combo_limited.pos_categ_id[0]] = combo_limited.quantity_limited;
                    } else {
                        self.combo_category_limited_by_product_tmpl_id[combo_limited.product_tmpl_id[0]][combo_limited.pos_categ_id[0]] = combo_limited.quantity_limited;
                    }
                }
            }
        },
        {
            label: 'Shop Logo', // shop logo
            condition: function (self) {
                true
            },
            loaded: function (self) {
                self.company_logo = new Image();
                return new Promise(function (resolve, reject) {
                    self.company_logo.onload = function () {
                        var img = self.company_logo;
                        var ratio = 1;
                        var targetwidth = 300;
                        var maxheight = 150;
                        if (img.width !== targetwidth) {
                            ratio = targetwidth / img.width;
                        }
                        if (img.height * ratio > maxheight) {
                            ratio = maxheight / img.height;
                        }
                        var width = Math.floor(img.width * ratio);
                        var height = Math.floor(img.height * ratio);
                        var c = document.createElement('canvas');
                        c.width = width;
                        c.height = height;
                        var ctx = c.getContext('2d');
                        ctx.drawImage(self.company_logo, 0, 0, width, height);

                        self.company_logo_base64 = c.toDataURL();
                        resolve()

                    };
                    self.company_logo.onerror = function (error) {
                        return reject()
                    };
                    self.company_logo.crossOrigin = "anonymous";
                    if (!self.is_mobile) {
                        self.company_logo.src = '/web/image' + '?model=pos.config&field=logo&id=' + self.config.id;
                    } else {
                        self.company_logo.src = '/web/binary/company_logo' + '?dbname=' + self.session.db + '&_' + Math.random();
                    }
                });
            },
        },
    ];

    var _super_PosModel = models.PosModel.prototype;
    models.PosModel = models.PosModel.extend({
        block_ui: function (message) {
            this.chrome.loading_show();
            this.setLoadingMessage(_t(message));
        },
        unblock_ui() {
            this.chrome.loading_hide()
        },
        get_units_barcode_by_id: function (product_id) {
            var units = this.barcodes_by_product_id[product_id]
            if (!units) {
                return []
            }
            return units
        },
        get_taxes: function (product) {
            if (!product.taxes_id) {
                return []
            } else {
                taxes = []
                for (var i = 0; i < product.taxes_id.length; i++) {
                    var tax = this.taxes_by_id[product.taxes_id[i]];
                    if (tax) {
                        taxes.push(tax)
                    }
                }
                return taxes
            }
        },
        get_count_variant: function (product_tmpl_id) {
            if (this.db.total_variant_by_product_tmpl_id[product_tmpl_id]) {
                return this.db.total_variant_by_product_tmpl_id[product_tmpl_id]
            } else {
                return 0
            }
        },
        restore_orders: function () {
            var self = this;
            return rpc.query({
                model: 'pos.backup.orders',
                method: 'get_unpaid_orders',
                args: [[], {
                    config_id: this.config.id,
                }]
            }, {
                shadow: true,
                timeout: 60000
            }).then(function (unpaid_orders) {
                if (unpaid_orders.length) {
                    var restored = 0;
                    var json_orders = JSON.parse(unpaid_orders);
                    var current_orders = self.get('orders');
                    var rollback_orders = [];
                    for (var index in json_orders) {
                        var unpaid_order = json_orders[index];
                        var order_exist = _.find(self.db.get_unpaid_orders(), function (order) {
                            return order.uid == unpaid_order.uid
                        });
                        if (!order_exist) {
                            restored += 1;
                            console.log('Restored back ' + restored + ' order');
                            new models.Order({}, {
                                pos: self,
                                json: unpaid_order,
                            });
                        } else {
                            console.log(unpaid_order.uid + ' exist in your browse cache');
                        }
                    }
                    return rollback_orders;
                }
            });
        },
        automation_backup_orders: function () {
            var self = this;
            return rpc.query({
                model: 'pos.backup.orders',
                method: 'automation_backup_orders',
                args: [[], {
                    config_id: this.config.id,
                    unpaid_orders: this.db.get_unpaid_orders(),
                }]
            }, {
                shadow: true,
                timeout: 60000
            }).then(function (backup_id) {
                setTimeout(_.bind(self.automation_backup_orders, self), 5000);
            }, function (err) {
                setTimeout(_.bind(self.automation_backup_orders, self), 5000);
            });
        },
        polling_job_auto_paid_orders_draft: function () {
            var self = this;
            var params = {
                message: 'Automatic Paid Orders Draft have full fill payment',
                config_id: this.config.id
            };
            var sending = function () {
                return session.rpc("/pos/automation/paid_orders", params, {
                    shadow: true,
                    timeout: 60000,
                });
            };
            return sending().then(function (result) {
                var result = JSON.parse(result);
                if (result['values'].length > 0) {
                    self.gui.show_popup('dialog', {
                        title: _t('Succeed'),
                        body: _t('Orders: ' + result['values'] + _t(' processed to paid')),
                        color: 'success'
                    })
                }
                setTimeout(_.bind(self.polling_job_auto_paid_orders_draft, self), 3000);
            }, function (err) {
                setTimeout(_.bind(self.polling_job_auto_paid_orders_draft, self), 3000);
            });
        },
        load_server_data: function () {
            var self = this;
            // TODO: list all model load realtime direct to ORM backend, if have any new model not inside in this list, will load from cache browse
            this.models_load_realtime = [
                'product.pricelist',
                'product.pricelist.item',
                'pos.category',
                'hr.employee',
                'account.journal',
                'res.users',
                'pos.pack.operation.lot',
                'res.users',
                'res.company',
                'uom.uom',
                'pos.payment.method',
                'pos.config',
                'pos.session',
                'restaurant.floor',
                'restaurant.table',
                'product.template.attribute.value',
            ];
            if (!self.session.big_datas_turbo) {
                return _super_PosModel.load_server_data.apply(this, arguments).then(function () {
                    self.config.module_pos_loyalty = false // locked loyalty of Odoo EE (kimamh)
                    self.pos_sync_pricelists = new exports.pos_sync_pricelists(self);
                    self.pos_sync_pricelists.start();
                    if (self.config.backup_orders_automatic) {
                        return self.restore_orders().then(function () {
                            self.automation_backup_orders();
                        })
                    } else {
                        return true
                    }
                })
            } else {
                var progress = 0;
                var progress_step = 1.0 / self.models.length;
                var tmp = {}; // this is used to share a temporary state between models loaders
                var loaded = new Promise(function (resolve, reject) {
                    function load_model(index) {
                        if (index >= self.models.length) {
                            resolve();
                        } else {
                            var model = self.models[index];
                            self.setLoadingMessage(_t('Loading') + ' ' + (model.label || model.model || ''), progress);

                            var cond = typeof model.condition === 'function' ? model.condition(self, tmp) : true;
                            if (!cond) {
                                load_model(index + 1);
                                return;
                            }

                            var fields = typeof model.fields === 'function' ? model.fields(self, tmp) : model.fields;
                            var domain = typeof model.domain === 'function' ? model.domain(self, tmp) : model.domain;
                            var context = typeof model.context === 'function' ? model.context(self, tmp) : model.context || {};
                            var ids = typeof model.ids === 'function' ? model.ids(self, tmp) : model.ids;
                            var order = typeof model.order === 'function' ? model.order(self, tmp) : model.order;
                            progress += progress_step;

                            if (model.model) {
                                var params = {
                                    model: model.model,
                                    context: _.extend(context, session.user_context || {}),
                                };

                                if (model.ids) {
                                    params.method = 'read';
                                    params.args = [ids, fields];
                                } else {
                                    params.method = 'search_read';
                                    params.domain = domain;
                                    params.fields = fields;
                                    params.orderBy = order;
                                }
                                if (self.json_datas && self.json_datas[model.model] && self.models_load_realtime.indexOf(model.model) == -1) {
                                    var results = self.json_datas[model.model];
                                    if (results.length == 1) {
                                        model.loaded(self, results[0], tmp);
                                    }
                                    if (results.length > 1) {
                                        var result = results.shift();
                                        model.loaded(self, result, tmp);
                                    }
                                    if (results.length == 0) {
                                        model.loaded(self, result, tmp);
                                    }
                                    load_model(index + 1);

                                } else {
                                    console.warn('Loading direct from backend model: ' + model.model);
                                    rpc.query(params).then(function (result) {
                                        var model = self.models[index];
                                        try { // catching exceptions in model.loaded(...)
                                            Promise.resolve(model.loaded(self, result, tmp))
                                                .then(function () {
                                                        load_model(index + 1);
                                                    },
                                                    function (err) {
                                                        reject(err);
                                                    });
                                        } catch (err) {
                                            console.error(err.message, err.stack);
                                            reject(err);
                                        }
                                    }, function (err) {
                                        console.error(err.message, err.stack);
                                        reject(err);
                                    });
                                }

                            } else if (model.loaded) {
                                try { // catching exceptions in model.loaded(...)
                                    Promise.resolve(model.loaded(self, tmp))
                                        .then(function () {
                                                load_model(index + 1);
                                            },
                                            function (err) {
                                                console.error(err.message, err.stack);
                                                reject(err);
                                            });
                                } catch (err) {
                                    console.error(err.message, err.stack);
                                    reject(err);
                                }
                            } else {
                                load_model(index + 1);
                            }
                        }
                    }

                    try {
                        return load_model(0);
                    } catch (err) {
                        console.error(err.message, err.stack);
                        return Promise.reject(err);
                    }
                });
                return loaded.then(function () {
                    self.pos_sync_pricelists = new exports.pos_sync_pricelists(self);
                    self.pos_sync_pricelists.start();
                    if (self.config.backup_orders_automatic) {
                        return self.restore_orders().then(function () {
                            self.automation_backup_orders();
                        })
                    } else {
                        return true
                    }
                });
            }

        },
        initialize: function (session, attributes) {
            var pos_category_model = this.get_model('pos.category');
            if (pos_category_model) {
                pos_category_model.domain = function (self) {
                    if (self.config.limit_categories) {
                        return self.config.limit_categories && self.config.iface_available_categ_ids.length ? [['id', 'in', self.config.iface_available_categ_ids]] : [];
                    } else {
                        return []
                    }
                };
            }
            _super_PosModel.initialize.call(this, session, attributes);
            this.models = this.models.concat(extend_models);
        },
    });

    return exports;
});
