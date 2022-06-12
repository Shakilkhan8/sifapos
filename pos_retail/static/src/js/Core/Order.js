"use strict";
/*
    This module create by: thanhchatvn@gmail.com
    License: OPL-1
    Please do not modification if i not accept
    Thanks for understand
 */
odoo.define('pos_retail.order', function (require) {

    var models = require('point_of_sale.models');
    var core = require('web.core');
    var _t = core._t;
    var MultiUnitWidget = require('pos_retail.multi_unit');
    var rpc = require('pos.rpc');
    var qweb = core.qweb;
    const PosComponent = require('point_of_sale.PosComponent');
    var utils = require('web.utils');
    var round_pr = utils.round_precision;

    var _super_PosModel = models.PosModel.prototype;
    models.PosModel = models.PosModel.extend({
        initialize: function (session, attributes) {
            _super_PosModel.initialize.apply(this, arguments);
            this.bind('change:selectedOrder', function (pos) {
                var order = pos.get_order();
                if (order) {
                    order.add_barcode('barcode'); // TODO: add barcode to html page
                }
            });
        }
    });

    var _super_Order = models.Order.prototype;
    models.Order = models.Order.extend({
        initialize: function (attributes, options) {
            _super_Order.initialize.apply(this, arguments);
            var self = this;
            if (!this.note) {
                this.note = '';
            }
            if (!this.signature) {
                this.signature = '';
            }
            if (!this.lock) {
                this.lock = false;
            }
            if (this.pos.config.auto_invoice) {
                this.to_invoice = true;
            }
            if (!this.seller && this.pos.default_seller) {
                this.seller = this.pos.default_seller;
            }
            if (!this.seller && this.pos.config.default_seller_id) {
                var seller = this.pos.user_by_id[this.pos.config.default_seller_id[1]];
                if (seller) {
                    this.seller = seller;
                }
            }
            if (!options.json) {
                if (this.pos.config.analytic_account_id) {
                    this.analytic_account_id = this.pos.config.analytic_account_id[0]
                }
                var pos_config_currency_id = this.pos.config.currency_id[0];
                var config_currency = this.pos.currency_by_id[pos_config_currency_id];
                if (config_currency) {
                    this.currency = config_currency;
                    this.currency_id = this.pos.config.currency_id[0];
                }
                this.status = 'Coming'
                var picking_type_id = this.pos.config.picking_type_id[0];
                this.set_picking_type(picking_type_id);
                this.plus_point = 0;
                this.redeem_point = 0;
            }
            this.bind('add remove', function (order) {
                self.pos.trigger('refresh.tickets')
            });
            this.orderlines.bind('change add remove', function (line) {
                self.pos.trigger('refresh.tickets')
            });

        },
        async ask_guest() {
            let {confirmed, payload: number} = await this.pos.chrome.showPopup('NumberPopup', {
                'title': _t('How many guests in this Table ?'),
                'startingValue': 0,
            });
            if (confirmed) {
                let value = Math.max(1, Number(number));
                this.set_customer_count(value);
                if (value < 1) {
                    this.pos.set_table(null);
                    this.pos.chrome.showPopup('ErrorPopup', {
                        title: _t('Alert'),
                        body: _t('Please input guest, and bigger than 1')
                    })
                }
            }
        },

        save_to_db: function () {
            _super_Order.save_to_db.apply(this, arguments);
            var selected_line = this.get_selected_orderline();
            if (selected_line) {
                this.pos.trigger('selected:line', selected_line)
            }
        },
        init_from_JSON: function (json) {
            // TODO: we removed line have product removed
            var lines = json.lines;
            var lines_without_product_removed = [];
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i];
                var product_id = line[2]['product_id'];
                var product = this.pos.db.get_product_by_id(product_id);
                if (product) {
                    lines_without_product_removed.push(line)
                }
            }
            json.lines = lines_without_product_removed;
            // ---------------------------------
            var res = _super_Order.init_from_JSON.apply(this, arguments);
            if (json.plus_point) {
                this.plus_point = json.plus_point;
            }
            if (json.redeem_point) {
                this.redeem_point = json.redeem_point;
            }
            if (json.booking_id) {
                this.booking_id = json.booking_id;
            }
            if (json.status) {
                this.status = json.status
            }
            if (json.date) {
                this.date = json.date;
            }
            if (json.name) {
                this.name = json.name;
            }
            if (json.email_invoice) {
                this.email_invoice = json.email_invoice;
            }
            if (json.email_invoice) {
                this.email_invoice = json.email_invoice;
            }
            if (json.delivery_date) {
                this.delivery_date = json.delivery_date;
            }
            if (json.delivery_address) {
                this.delivery_address = json.delivery_address;
            }
            if (json.delivery_phone) {
                this.delivery_phone = json.delivery_phone;
            }
            if (json.amount_debit) {
                this.amount_debit = json.amount_debit;
            }
            if (json.return_order_id) {
                this.return_order_id = json.return_order_id;
            }
            if (json.is_return) {
                this.is_return = json.is_return;
            }
            if (json.to_invoice) {
                this.to_invoice = json.to_invoice;
            }
            if (json.parent_id) {
                this.parent_id = json.parent_id;
            }
            if (json.payment_journal_id) {
                this.payment_journal_id = json.payment_journal_id;
            } else {
                this.payment_journal_id = this.pos.get_default_sale_journal();
            }
            if (json.ean13) {
                this.ean13 = json.ean13;
            }
            if (json.signature) {
                this.signature = json.signature
            }
            if (json.note) {
                this.note = json.note
            }
            if (json.lock) {
                this.lock = json.lock;
            } else {
                this.lock = false;
            }
            if (json.guest) {
                this.guest = json.guest;
            }
            if (json.guest_number) {
                this.guest_number = json.guest_number;
            }
            if (json.location_id) {
                var location = this.pos.stock_location_by_id[json.location_id];
                if (location) {
                    this.set_picking_source_location(location)
                } else {
                    var location = this.get_picking_source_location();
                    this.set_picking_source_location(location)
                }
            } else {
                var location = this.get_picking_source_location();
                if (location) {
                    this.set_picking_source_location(location);
                }
            }
            if (json.add_credit) {
                this.add_credit = json.add_credit
            } else {
                this.add_credit = false;
            }
            if (json.user_id) {
                this.seller = this.pos.user_by_id[json.user_id];
            }
            if (json.currency_id) {
                var currency = this.pos.currency_by_id[json.currency_id];
                this.currency = currency;
            }
            if (json.analytic_account_id) {
                this.analytic_account_id = json.analytic_account_id
            }
            if (json.shipping_id) {
                this.shipping_id = json.shipping_id
            }
            if (json.employee_id) {
                // todo: default module point_of_sale core odoo define variable employee_id linked to cashier but backend not define employee_id
                // todo: my module have define employee_id, and when force cashier id to employee will have issue
                // todo: so we recheck have employee with cashier id or not, if yes, allow save, else set back null
                if (this.pos.employee_by_id) {
                    var employee = this.pos.employee_by_id[json.employee_id]
                    if (!employee) {
                        this.employee_id = null
                    }
                } else {
                    this.employee_id = null
                }
            }
            if (json.picking_type_id) {
                this.set_picking_type(json.picking_type_id)
            }
            return res;
        },
        export_as_JSON: function () {
            var json = _super_Order.export_as_JSON.apply(this, arguments);
            if (this.promotion_amount) {
                json.promotion_amount = this.promotion_amount;
            }
            if (this.plus_point) {
                json.plus_point = this.plus_point;
            }
            if (this.redeem_point) {
                json.redeem_point = this.redeem_point;
            }
            if (this.booking_id) {
                json.booking_id = this.booking_id
            }
            if (this.status) {
                json.status = this.status
            } else {
                json.status = 'Coming'
            }
            if (this.seller) {
                json.user_id = this.seller['id'];
            }
            if (this.partial_payment) {
                json.partial_payment = this.partial_payment
            }
            if (this.email_invoice) {
                json.email_invoice = this.email_invoice;
                var client = this.get_client();
                if (client && client.email) {
                    json.email = client.email;
                }
            }
            if (this.delivery_date) {
                json.delivery_date = this.delivery_date;
            }
            if (this.delivery_address) {
                json.delivery_address = this.delivery_address;
            }
            if (this.delivery_phone) {
                json.delivery_phone = this.delivery_phone;
            }
            if (this.amount_debit) {
                json.amount_debit = this.amount_debit;
            }
            if (this.return_order_id) {
                json.return_order_id = this.return_order_id;
            }
            if (this.is_return) {
                json.is_return = this.is_return;
            }
            if (this.parent_id) {
                json.parent_id = this.parent_id;
            }
            if (this.payment_journal_id) {
                json.payment_journal_id = this.payment_journal_id;
            } else {
                this.payment_journal_id = this.pos.get_default_sale_journal();
            }
            if (this.note) {
                json.note = this.note;
            }
            if (this.signature) {
                json.signature = this.signature;
            }
            if (this.ean13) {
                json.ean13 = this.ean13;
                this.add_barcode('barcode')
            }
            if (!this.ean13 && this.uid) {
                var ean13_code = this.zero_pad('6', 4) + this.zero_pad(this.pos.pos_session.login_number, 4) + this.zero_pad(this.sequence_number, 4);
                var ean13 = ean13_code.split("");
                var ean13_array = [];
                for (var i = 0; i < ean13.length; i++) {
                    if (i < 12) {
                        ean13_array.push(ean13[i])
                    }
                }
                this.ean13 = ean13_code + this.generate_unique_ean13(ean13_array).toString();
                this.add_barcode('barcode')
            }
            if (this.lock) {
                json.lock = this.lock;
            } else {
                json.lock = false;
            }
            if (this.invoice_ref) {
                json.invoice_ref = this.invoice_ref
            }
            if (this.picking_ref) {
                json.picking_ref = this.picking_ref
            }
            if (this.guest) {
                json.guest = this.guest
            }
            if (this.guest_number) {
                json.guest_number = this.guest_number
            }
            if (this.add_credit) {
                json.add_credit = this.add_credit
            } else {
                json.add_credit = false
            }
            if (this.location_id) {
                var stock_location_id = this.pos.config.stock_location_id;
                if (stock_location_id) {
                    var location = this.pos.stock_location_by_id[this.location_id];
                    if (location) {
                        json.location = location;
                        json.location_id = location.id;
                    }
                }
            }
            if (this.currency) {
                json.currency_id = this.currency.id
            }
            if (this.analytic_account_id) {
                json.analytic_account_id = this.analytic_account_id
            }
            if (this.shipping_id) {
                json.shipping_id = this.shipping_id
            }
            if (json.employee_id) {
                // todo: default module point_of_sale core odoo define variable employee_id linked to cashier but backend not define employee_id
                // todo: my module have define employee_id, and when force cashier id to employee will have issue
                // todo: so we recheck have employee with cashier id or not, if yes, allow save, else set back null
                if (this.pos.employee_by_id) {
                    var employee = this.pos.employee_by_id[json.employee_id]
                    if (!employee) {
                        json.employee_id = null;
                        this.employee_id = null;
                    }
                } else {
                    json.employee_id = null;
                    this.employee_id = null;
                }

            }
            if (this.picking_type) {
                json.picking_type_id = this.picking_type.id;
            }
            return json;
        },
        export_for_printing: function () {
            var receipt = _super_Order.export_for_printing.call(this);
            if (this.promotion_amount) {
                receipt.promotion_amount = this.promotion_amount;
            }
            receipt.plus_point = this.plus_point || 0;
            receipt.redeem_point = this.redeem_point || 0;
            var order = this.pos.get_order();
            if (this.picking_type) {
                receipt['picking_type'] = this.picking_type;
            }
            if (this.seller) {
                receipt['seller'] = this.seller;
            }
            if (this.location) {
                receipt['location'] = this.location;
            } else {
                var stock_location_id = this.pos.config.stock_location_id;
                if (stock_location_id) {
                    receipt['location'] = this.pos.stock_location_by_id[stock_location_id[0]];
                }
            }
            receipt['currency'] = order.currency;
            receipt['guest'] = this.guest;
            receipt['guest_number'] = this.guest_number;
            receipt['delivery_date'] = this.delivery_date;
            receipt['delivery_address'] = this.delivery_address;
            receipt['delivery_phone'] = this.delivery_phone;
            receipt['note'] = this.note;
            receipt['signature'] = this.signature;
            if (this.shipping_client) {
                receipt['shipping_client'] = this.shipping_client;
            }
            if (this.fiscal_position) {
                receipt.fiscal_position = this.fiscal_position
            }
            if (this.amount_debit) {
                receipt['amount_debit'] = this.amount_debit;
            }
            var orderlines_by_category_name = {};
            var orderlines = order.orderlines.models;
            var categories = [];
            receipt['categories'] = [];
            receipt['orderlines_by_category_name'] = [];
            if (this.pos.config.category_wise_receipt) {
                for (var i = 0; i < orderlines.length; i++) {
                    var line = orderlines[i];
                    var pos_categ_id = line['product']['pos_categ_id']
                    line['tax_amount'] = line.get_tax();
                    if (pos_categ_id && pos_categ_id.length == 2) {
                        var root_category_id = order.get_root_category_by_category_id(pos_categ_id[0])
                        var category = this.pos.db.category_by_id[root_category_id]
                        var category_name = category['name'];
                        if (!orderlines_by_category_name[category_name]) {
                            orderlines_by_category_name[category_name] = [line];
                            var category_index = _.findIndex(categories, function (category) {
                                return category == category_name;
                            });
                            if (category_index == -1) {
                                categories.push(category_name)
                            }
                        } else {
                            orderlines_by_category_name[category_name].push(line)
                        }

                    } else {
                        if (!orderlines_by_category_name['None']) {
                            orderlines_by_category_name['None'] = [line]
                        } else {
                            orderlines_by_category_name['None'].push(line)
                        }
                        var category_index = _.findIndex(categories, function (category) {
                            return category == 'None';
                        });
                        if (category_index == -1) {
                            categories.push('None')
                        }
                    }
                }
                receipt['orderlines_by_category_name'] = orderlines_by_category_name;
                receipt['categories'] = categories;
            }
            receipt['total_due'] = order.get_due(); // save amount due if have (display on receipt of parital order)
            if (order.internal_ref) {
                receipt['internal_ref'] = order.internal_ref
            }
            if (order.purchase_ref) {
                receipt['purchase_ref'] = order.purchase_ref
            }
            if (order.booking_uid) {
                receipt['booking_uid'] = order.booking_uid
            }
            if (order.sequence_number) {
                receipt['sequence_number'] = order.sequence_number
            }
            return receipt
        },
        build_plus_point: function () {
            var total_point = 0;
            var lines = this.orderlines.models;
            if (lines.length == 0 || !lines) {
                return total_point;
            }
            var loyalty = this.pos.loyalty;
            if (!loyalty) {
                return total_point;
            }
            var rules = [];
            var rules_by_loylaty_id = this.pos.rules_by_loyalty_id[loyalty.id];
            if (!rules_by_loylaty_id) {
                return total_point;
            }
            for (var j = 0; j < rules_by_loylaty_id.length; j++) {
                rules.push(rules_by_loylaty_id[j]);
            }
            if (!rules) {
                return total_point;
            }
            if (rules.length) {
                for (var j = 0; j < lines.length; j++) { // TODO: reset plus point each line
                    var line = lines[j];
                    line.plus_point = 0;
                }
                // Todo: we have 3 type rule
                //      - plus point base on order amount total
                //      - plus point base on pos category
                //      - plus point base on amount total
                for (var j = 0; j < lines.length; j++) {
                    var line = lines[j];
                    if (line['redeem_point'] || (line['promotion'] && !this.pos.config.loyalty_combine_promotion)) {
                        line['plus_point'] = 0;
                        continue;
                    } else {
                        line.plus_point = 0;
                        for (var i = 0; i < rules.length; i++) {
                            var rule = rules[i];
                            var plus_point = 0;
                            plus_point = line.get_price_with_tax() * rule['coefficient'];
                            if ((rule['type'] == 'products' && rule['product_ids'].indexOf(line.product['id']) != -1) || (rule['type'] == 'categories' && rule['category_ids'].indexOf(line.product.pos_categ_id[0]) != -1) || (rule['type'] == 'order_amount')) {
                                line.plus_point += plus_point;
                                total_point += plus_point;
                            }
                        }
                    }
                }
            }
            return total_point;
        },
        build_redeem_point: function () {
            var redeem_point = 0;
            var lines = this.orderlines.models;
            if (lines.length == 0 || !lines) {
                return redeem_point;
            }
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i];
                var line_redeem_point = line['redeem_point'] || 0;
                if (line_redeem_point) {
                    redeem_point += line_redeem_point;
                }
                if (line.credit_point) {
                    line['redeem_point'] = line.credit_point;
                    redeem_point += line.redeem_point;
                    line.credit_point = 0;
                }
                line.redeem_point = line_redeem_point;
            }
            return round_pr(redeem_point || 0, this.pos.loyalty.rounding);
        },
        get_client_point: function () {
            var client = this.get_client();
            if (!client) {
                return {
                    redeem_point: 0,
                    plus_point: 0,
                    pos_loyalty_point: 0,
                    remaining_point: 0,
                    next_point: 0,
                    client_point: 0
                }
            }
            var redeem_point = this.build_redeem_point();
            var plus_point = this.build_plus_point();
            if (this.pos.loyalty.rounding_down) {
                plus_point = parseInt(plus_point);
            }
            var pos_loyalty_point = client.pos_loyalty_point || 0;
            var remaining_point = pos_loyalty_point - redeem_point;
            var next_point = pos_loyalty_point - redeem_point + plus_point;
            return {
                redeem_point: redeem_point,
                plus_point: plus_point,
                pos_loyalty_point: pos_loyalty_point,
                remaining_point: remaining_point,
                next_point: next_point,
                client_point: pos_loyalty_point,
            }
        },
        client_use_voucher: function (voucher) {
            const self = this;
            this.voucher_id = voucher.id;
            var method = _.find(this.pos.payment_methods, function (method) {
                return method.pos_method_type == 'voucher';
            });
            if (method) {
                this.paymentlines.models.forEach(function (p) {
                    if (p.payment_method.journal && p.payment_method.journal.pos_method_type == 'voucher') {
                        self.remove_paymentline(p)
                    }
                })
                var due = this.get_due();
                if (voucher['customer_id'] && voucher['customer_id'][0]) {
                    var client = this.pos.db.get_partner_by_id(voucher['customer_id'][0]);
                    if (client) {
                        this.set_client(client)
                    }
                }
                var amount = 0;
                if (voucher['apply_type'] == 'fixed_amount') {
                    amount = voucher.value;
                } else {
                    amount = this.get_total_with_tax() / 100 * voucher.value;
                }
                if (amount <= 0) {
                    return this.pos.chrome.showPopup('ConfirmPopup', {
                        title: _t('Warning'),
                        body: _t('Voucher Used Full Amount, please use another Voucher'),
                    });
                }
                this.add_paymentline(method);
                var voucher_paymentline = this.selected_paymentline;
                voucher_paymentline['voucher_id'] = voucher['id'];
                voucher_paymentline['voucher_code'] = voucher['code'];
                var voucher_amount = 0;
                if (amount >= due) {
                    voucher_amount = due;
                } else {
                    voucher_amount = amount;
                }
                if (voucher_amount > 0) {
                    voucher_paymentline.set_amount(voucher_amount);
                    this.pos.chrome.showPopup('ConfirmPopup', {
                        title: _t('Success! Voucher just set to Payment Order'),
                        body: _t('Set ' + this.pos.format_currency(voucher_amount)) + ' to Payment Amount of Order ',
                    });
                } else {
                    this.pos.chrome.showPopup('ErrorPopup', {
                        title: _t('Warning'),
                        body: _t('Selected Order Paid Full, Could not adding more Voucher Value'),
                    });
                }
            } else {
                this.pos.chrome.showPopup('ErrorPopup', {
                    title: _t('Warning'),
                    body: _t('Your POS Payment Voucher removed, we could not add voucher to your Order'),
                });
            }
        },
        set_picking_type: function (picking_type_id) {
            var picking_type = this.pos.stock_picking_type_by_id[picking_type_id];
            this.picking_type = picking_type;
            this.pos.trigger('set.picking.type')
        },
        set_pricelist: function (pricelist) {
            let self = this;
            let lastPricelist = this.pricelist;
            let res = _super_Order.set_pricelist.apply(this, arguments);
            // todo: when change pricelist difference currency with POS, auto recompute price of cart
            if (!this.is_return && pricelist && pricelist.currency_id) {
                var selectedCurrency = this.pos.currency_by_id[pricelist.currency_id[0]];
                if (lastPricelist && lastPricelist.currency_id && pricelist.currency_id && lastPricelist.currency_id[0] != pricelist.currency_id[0]) {
                    let linesToReCompute = this.get_orderlines().filter((l) => !l.price_manually_set)
                    linesToReCompute.forEach(function (l) {
                        l.set_unit_price(l.product.get_price(pricelist, l.get_quantity()));
                        self.fix_tax_included_price(l);
                    })
                }
                this.paymentlines.models.forEach(function (p) {
                    self.remove_paymentline(p)
                })
                this.currency = selectedCurrency;
                this.pricelist = pricelist;
                this.trigger('change', this);
            }
            return res;
        },
        add_paymentline: function (payment_method) {
            var newPaymentline = _super_Order.add_paymentline.apply(this, arguments);
            if (payment_method.fullfill_amount && this.get_due() != 0) {
                newPaymentline.set_amount(this.get_due())
            }
            return newPaymentline;
        },
        set_picking_source_location: function (location) {
            // todo: set location_id for order backend
            this.location = location;
            this.location_id = location.id;
            this.pos.config.stock_location_id = [location.id, location.name];
            this.trigger('change', this);
        },
        get_picking_source_location: function () {
            var stock_location_id = this.pos.config.stock_location_id;
            if (this.location) {
                return this.location;
            } else {
                return this.pos.stock_location_by_id[stock_location_id[0]];
            }
        },
        remove_selected_orderline: function () {
            var line = this.get_selected_orderline();
            if (line) {
                this.remove_orderline(line)
            }
        },
        set_currency: function (currency) {
            var rate = currency.rate;
            if (rate > 0) {
                var lines = this.orderlines.models;
                for (var n = 0; n < lines.length; n++) {
                    var line = lines[n];
                    line.set_unit_price_with_currency(line.price, currency)
                }
                this.currency = currency;
                this.pos.trigger('change:currency'); // TODO: update ticket and order cart
            } else {
                this.currency = null;
            }
            this.trigger('change', this);
        },
        add_barcode: function (element) {
            if (!this.element) {
                try {
                    JsBarcode('#' + element, this['ean13'], {
                        format: "EAN13",
                        displayValue: true,
                        fontSize: 14
                    });
                    this[element + '_bas64'] = document.getElementById(element).src
                } catch (ex) {
                    console.warn('Error set barcode to element: ' + ex)
                }
            }
        },
        zero_pad: function (num, size) {
            if (num == undefined) {
                console.error('Login number error: ' + num)
                num = '0123456789'
            }
            var s = "" + num;
            while (s.length < size) {
                s = s + Math.floor(Math.random() * 10).toString();
            }
            return s;
        },
        get_guest: function () {
            if (this.guest) {
                return this.guest
            } else {
                return null
            }
        },
        _get_client_content: function (client) {
            var content = '';
            if (client.mobile) {
                content += 'Mobile: ' + client.mobile + ' , ';
            }
            if (client.phone) {
                content += 'Mobile: ' + client.phone + ' , ';
            }
            if (client.email) {
                content += 'Email: ' + client.email + ' , ';
            }
            if (client.address) {
                content += 'Address: ' + client.address + ' , ';
            }
            if (client.balance) {
                content += 'Credit: ' + this.pos.format_currency(client.balance) + ' , ';
            }
            if (client.wallet) {
                content += 'Wallet Card: ' + this.pos.format_currency(client.wallet) + ' , ';
            }
            if (client.pos_loyalty_point) {
                content += 'Loyalty Point: ' + this.pos.format_currency_no_symbol(client.pos_loyalty_point) + ' , ';
            }
            return content
        },
        set_shipping_client: function (client) {
            this.assert_editable();
            this.set('client', client);
            this.shipping_client = client;
        },
        set_client: function (client) {
            var self = this;
            var res = _super_Order.set_client.apply(this, arguments);
            if (client && !this.pos.the_first_load) {
                if (client.balance < 0) {
                    this.pos.chrome.showPopup('ErrorPopup', {
                        title: _t('Warning'),
                        body: client.name + _t('has Debt Amount is: ' + this.pos.format_currency(client.balance) + ', Please take look because Credit/Debt Balance smaller than 0')
                    })
                }
                var partial_payment_orders = _.filter(this.pos.db.get_pos_orders(), function (order) {
                    return order['partner_id'] && order['partner_id'][0] == client['id'] && order['state'] == 'draft';
                });
                if (partial_payment_orders.length != 0) {
                    var warning_message = 'Customer selected have orders: ';
                    for (var i = 0; i < partial_payment_orders.length; i++) {
                        warning_message += partial_payment_orders[i]['name'];
                        warning_message += '(' + partial_payment_orders[i]['date_order'] + ')';
                        if ((i + 1) == partial_payment_orders.length) {
                            warning_message += ' .';
                        } else {
                            warning_message += ',';
                        }
                    }
                    warning_message += ' not payment full';
                    if (this.pos.chrome) {
                        this.pos.chrome.showPopup('ConfirmPopup', {
                            title: client.name,
                            body: warning_message,
                        })
                    }

                }
                if (client.group_ids.length > 0) {
                    var list = [];
                    for (var i = 0; i < client.group_ids.length; i++) {
                        var group_id = client.group_ids[i];
                        var group = this.pos.membership_group_by_id[group_id];
                        if (group.pricelist_id) {
                            list.push({
                                'label': group.name,
                                'item': group
                            });
                        }
                    }
                    if (list.length > 0 && this.pos.gui.popup_instances['selection']) {
                        setTimeout(function () {
                            self.pos.chrome.showPopup('selection', {
                                title: _t('Please add group/membership to customer ' + client.name),
                                list: list,
                                confirm: function (group) {
                                    if (!self.pos.pricelist_by_id || !self.pos.pricelist_by_id[group.pricelist_id[0]]) {
                                        return self.pos.chrome.showPopup('ErrorPopup', {
                                            title: _t('Warning'),
                                            body: _t('Your POS not added pricelist') + group.pricelist_id[1],
                                        })
                                    }
                                    var pricelist = self.pos.pricelist_by_id[group.pricelist_id[0]];
                                    var order = self.pos.get_order();
                                    if (order && pricelist) {
                                        order.set_pricelist(pricelist);
                                        return self.pos.chrome.showPopup('ConfirmPopup', {
                                            title: _t('Succeed'),
                                            body: group.pricelist_id[1] + ' added',
                                        })
                                    }
                                }
                            });
                        }, 1000);
                    }
                }
            }
            if (client && this.pos.services_charge_ids && this.pos.services_charge_ids.length && this.pos.config.service_shipping_automatic && !this.pos.the_first_load) {
                this.pos.rpc({
                    model: 'pos.service.charge',
                    method: 'get_service_shipping_distance',
                    args: [[], client.id, this.pos.config.stock_location_id[0]],
                    context: {}
                }).then(function (service) {
                    for (var i = 0; i < self.orderlines.models.length; i++) {
                        var line = self.orderlines.models[i];
                        if (line.is_shipping_cost) {
                            self.remove_orderline(line);
                        }
                    }
                    if (service && service['service_id']) {
                        self.delivery_address = service['to_address'];
                        var service_charge = self.pos.service_charge_by_id[service['service_id']];
                        var product = self.pos.db.get_product_by_id(service_charge['product_id'][0]);
                        if (product) {
                            self.add_shipping_cost(service_charge, product, true)
                        }
                    } else {
                        self.pos.chrome.showPopup('ErrorPopup', {
                            title: _t('Warning'),
                            body: _t('Could not define service Shipping Cost, please add manual. \n' +
                                'You have missed config: \n' +
                                '1. Please setup Google Map Key and distance each Service Charge \n' +
                                '2. Your POS Stock Location not set Location Address')
                        })
                    }
                }, function (err) {
                    return self.pos.query_backend_fail(err)
                })
            }

            return res
        },
        add_shipping_cost: function (service, product, is_shipping_cost) {
            if (service['type'] == 'fixed') {
                this.add_product(product, {
                    price: service.amount,
                    quantity: 1,
                    merge: false,
                    extras: {
                        service_id: service.id,
                    }
                });
            } else {
                var amount_total = this.get_total_with_tax();
                var amount_tax = this.get_total_tax();
                var sub_amount = amount_total - amount_tax;
                var price = sub_amount - (sub_amount * service.amount / 100)
                this.add_product(product, {
                    price: price,
                    quantity: 1,
                    merge: false,
                    extras: {
                        service_id: service.id,
                    }
                });
            }
            var selected_line = this.get_selected_orderline();
            selected_line.is_shipping_cost = is_shipping_cost;
            selected_line.service_id = service.id;
            selected_line.trigger('change', selected_line)
        },
        validate_global_discount: function () {
            var self = this;
            var client = this && this.get_client();
            if (client && client['discount_id']) {
                this.pos.gui.show_screen('products');
                this.discount = this.pos.discount_by_id[client['discount_id'][0]];
                this.pos.gui.show_screen('products');
                var body = client['name'] + ' have discount ' + self.discount['name'] + '. Do you want to apply ?';
                return this.pos.chrome.showPopup('ConfirmPopup', {
                    'title': _t('Customer special discount ?'),
                    'body': body,
                    confirm: function () {
                        self.add_global_discount(self.discount);
                        self.pos.gui.show_screen('payment');
                        self.validate_payment();
                    },
                    cancel: function () {
                        self.pos.gui.show_screen('payment');
                        self.validate_payment();
                    }
                });
            } else {
                this.validate_payment();
            }
        },
        validate_payment_order: function () {
            var self = this;
            var client = this.get_client();
            if (this && this.orderlines.models.length == 0) {
                this.pos.gui.show_screen('products');
                return this.pos.chrome.showPopup('ErrorPopup', {
                    title: _t('Warning'),
                    body: _t('Your order is blank cart'),
                })
            } else {
                if (this.get_total_with_tax() == 0) {
                    this.pos.chrome.showPopup('ErrorPopup', {
                        title: _t('Warning'),
                        body: _t('Your order have total paid is 0, please take careful')
                    })
                }
            }
            if (this.remaining_point && this.remaining_point < 0) {
                this.pos.gui.show_screen('products');
                return this.pos.chrome.showPopup('ErrorPopup', {
                    title: _t('Warning'),
                    body: _t('You could not applied redeem point bigger than client point'),
                });
            }
            this.validate_order_return();
            if (!this.is_return) {
                this.validate_promotion();
            }
            if (this.is_to_invoice() && !this.get_client()) {
                this.pos.gui.show_screen('clientlist');
                this.pos.chrome.showPopup('ErrorPopup', {
                    title: _t('Warning'),
                    body: _t('Please add client the first')
                });
                return false;
            }
            return true
        },
        validate_order_return: function () {
            if (this.pos.config.required_reason_return) {
                var line_missed_input_return_reason = _.find(this.orderlines.models, function (line) {
                    return line.get_price_with_tax() < 0 && !line.has_input_return_reason();
                });
                if (line_missed_input_return_reason) {
                    this.pos.gui.show_screen('products');
                    return this.pos.chrome.showPopup('ErrorPopup', {
                        title: _t('Alert'),
                        body: _t('Please input return reason for each line'),
                    });
                } else {
                    return false
                }
            } else {
                return false
            }
        },
        set_discount_price: function (price_will_discount, tax) {
            if (tax.include_base_amount) {
                var line_subtotal = this.get_price_with_tax() / this.quantity;
                var tax_before_discount = (line_subtotal - line_subtotal / (1 + tax.amount / line_subtotal));
                var price_before_discount = line_subtotal - tax_before_discount; // b
                var tax_discount = price_will_discount - price_will_discount / (1 + tax.amount / price_will_discount);
                var price_discount = price_will_discount - tax_discount; // d
                var price_exincluded_discount = price_before_discount - price_discount;
                var new_tax_wihtin_discount = price_exincluded_discount - price_exincluded_discount / (1 + tax.amount / price_exincluded_discount);
                var new_price_wihtin_discount = line_subtotal - price_will_discount;
                var new_price_without_tax = new_price_wihtin_discount - new_tax_wihtin_discount;
                var new_price_within_tax = new_price_without_tax + new_tax_wihtin_discount;
                this.set_unit_price(new_price_within_tax);
            } else {
                var tax_discount = tax.amount / 100 * price_will_discount;
                var price_discount = price_will_discount - tax_discount;
                var new_price_within_tax = this.price - price_discount - (0.91 * (parseInt(price_will_discount / 100)));
                this.set_unit_price(new_price_within_tax);
            }
        },
        add_global_discount: function (discount) {
            var lines = this.orderlines.models;
            if (!lines.length) {
                return this.pos.chrome.showPopup('ErrorPopup', {
                    title: _t('Warning'),
                    body: _t('Your order is blank cart'),
                })
            }
            if (discount.type == 'percent') {
                for (var i = 0; i < lines.length; i++) {
                    var line = lines[i];
                    line.discount_extra = discount.amount;
                    line.trigger('change', line)
                }
            } else {
                for (var i = 0; i < lines.length; i++) {
                    var line = lines[i];
                    line.price_extra = -discount.amount / lines.length;
                    line.trigger('change', line)
                }
            }
        },
        clear_discount_extra: function () {
            var lines = this.orderlines.models;
            lines.forEach(l => {
                l.discount_extra = 0
                l.price_extra = 0
                l.trigger('change')
            })
        },
        async set_discount_value(discount) {
            // todo: will check disccount bigger than limited discount or not? If bigger than, call admin confirm it
            var order = this;
            var lines = order.get_orderlines();
            var total_withtax = this.get_total_with_tax();
            if (discount > total_withtax) {
                return this.pos.chrome.showPopup('ErrorPopup', {
                    title: _t('Error'),
                    body: _t('It not possible apply discount made total amount order smaller than 0')
                })
            } else {
                if (this.pos.config.discount_limit && this.pos.config.discount_value_limit < discount) {
                    let confirm = await this.pos._validate_action(this.env._t('Need approve add discount value'));
                    if (!confirm) {
                        return this.pos.chrome.showPopup('ErrorPopup', {
                            title: this.pos.env._t('Warning'),
                            body: this.pos.env._t('Required Manager approved this discount because this discount bigger than Discount Value Limit on POS Setting')
                        });
                    }
                } else {
                    var discount = discount / lines.length;
                    for (var i = 0; i < lines.length; i++) {
                        var line = lines[i];
                        line.price_extra = -discount;
                        line.trigger('change', line);
                    }
                }

            }
        },
        set_to_invoice: function (to_invoice) {
            if (to_invoice) {
                this.add_credit = false;
                this.trigger('change');
            }
            return _super_Order.set_to_invoice.apply(this, arguments);
        },
        is_add_credit: function () {
            return this.add_credit
        },
        add_order_credit: function () {
            this.add_credit = !this.add_credit;
            if (this.add_credit) {
                this.set_to_invoice(false);
            }
            this.trigger('change');
            if (this.add_credit && !this.get_client()) {
                this.pos.gui.show_screen('clientlist');
                return this.pos.chrome.showPopup('ErrorPopup', {
                    title: _t('Warning'),
                    body: 'Please add customer need add credit'
                })
            }
        },
        is_email_invoice: function () { // send email invoice or not
            return this.email_invoice;
        },
        set_email_invoice: function (email_invoice) {
            this.assert_editable();
            this.email_invoice = email_invoice;
            this.set_to_invoice(email_invoice);
        },
        get_root_category_by_category_id: function (category_id) { // get root of category, root is parent category is null
            var root_category_id = category_id;
            var category_parent_id = this.pos.db.category_parent[category_id];
            if (category_parent_id) {
                root_category_id = this.get_root_category_by_category_id(category_parent_id)
            }
            return root_category_id
        },
        // odoo wrong when compute price with tax have option price included
        // and now i fixing
        fix_tax_included_price: function (line) {
            this.syncing = true;
            _super_Order.fix_tax_included_price.apply(this, arguments);
            if (this.fiscal_position) {
                var unit_price = line.product['lst_price'];
                var taxes = line.get_taxes();
                var mapped_included_taxes = [];
                _(taxes).each(function (tax) {
                    var line_tax = line._map_tax_fiscal_position(tax);
                    if (tax.price_include && tax.id != line_tax.id) {
                        mapped_included_taxes.push(tax);
                    }
                });
                if (mapped_included_taxes.length > 0) {
                    unit_price = line.compute_all(mapped_included_taxes, unit_price, 1, this.pos.currency.rounding, true).total_excluded;
                    line.set_unit_price(unit_price);
                }
            }
            this.syncing = false;
        },
        set_signature: function (signature) {
            this.signature = signature;
            this.trigger('change', this);
        },
        get_signature: function () {
            if (this.signature) {
                return 'data:image/png;base64, ' + this.signature
            } else {
                return null
            }
        },
        set_note: function (note) {
            this.note = note;
            this.trigger('change', this);
        },
        get_note: function (note) {
            return this.note;
        },
        active_button_add_wallet: function (active) {
            var $add_wallet = $('.add_wallet');
            if (!$add_wallet) {
                return;
            }
            if (active) {
                $add_wallet.removeClass('oe_hidden');
                $add_wallet.addClass('highlight')
            } else {
                $add_wallet.addClass('oe_hidden');
            }
        },
        get_due_without_rounding: function (paymentline) {
            if (!paymentline) {
                var due = this.get_total_with_tax() - this.get_total_paid();
            } else {
                var due = this.get_total_with_tax();
                var lines = this.paymentlines.models;
                for (var i = 0; i < lines.length; i++) {
                    if (lines[i] === paymentline) {
                        break;
                    } else {
                        due -= lines[i].get_amount();
                    }
                }
            }
            return due;
        },
        generate_unique_ean13: function (array_code) {
            if (array_code.length != 12) {
                return -1
            }
            var evensum = 0;
            var oddsum = 0;
            for (var i = 0; i < array_code.length; i++) {
                if ((i % 2) == 0) {
                    evensum += parseInt(array_code[i])
                } else {
                    oddsum += parseInt(array_code[i])
                }
            }
            var total = oddsum * 3 + evensum;
            return parseInt((10 - total % 10) % 10)
        },
        get_product_image_url: function (product) {
            return window.location.origin + '/web/image?model=product.product&field=image_128&id=' + product.id;
        },
        _covert_pos_line_to_sale_line: function (line) {
            var product = this.pos.db.get_product_by_id(line.product_id);
            var line_val = {
                product_id: line.product_id,
                price_unit: line.price_unit,
                product_uom_qty: line.qty,
                discount: line.discount,
                product_uom: product.uom_id[0],
            };
            if (line.uom_id) {
                line_val['product_uom'] = line.uom_id
            }
            if (line.variants) {
                line_val['variant_ids'] = [[6, false, []]];
                for (var j = 0; j < line.variants.length; j++) {
                    var variant = line.variants[j];
                    line_val['variant_ids'][0][2].push(variant.id)
                }
            }
            if (line.tax_ids) {
                line_val['tax_id'] = line.tax_ids;
            }
            if (line.note) {
                line_val['pos_note'] = line.note;
            }
            return [0, 0, line_val];
        },
        _final_and_print_booking_order: function (result) {
            var order = this.pos.get_order();
            this.pos.set('order', order);
            this.pos.db.remove_unpaid_order(order);
            this.pos.db.remove_order(order['uid']);
            order.name = result['name'];
            order.uid = result['name']
            order.booking_uid = result['name']
            order.temporary = true;
            order.trigger('change', order);
            var booking_link = window.location.origin + "/web#id=" + result.id + "&view_type=form&model=sale.order";
            window.open(booking_link, '_blank');
        },
        ask_cashier_generic_options: function () {
            var self = this;
            var selected_orderline = this.get_selected_orderline();
            var generic_options = selected_orderline.get_product_generic_options()
            if (generic_options.length) {
                if (selected_orderline.generic_options) {
                    for (var i = 0; i < generic_options.length; i++) {
                        var generic_option = generic_options[i];
                        var generic_option_selected = _.find(selected_orderline.generic_options, function (generic) {
                            return generic.id == generic_option.id
                        })
                        if (generic_option_selected) {
                            generic_option.selected = true
                        } else {
                            generic_option.selected = false
                        }
                    }
                }
                return this.pos.chrome.showPopup('popup_selection_extend', {
                    title: _t('Please select Generic Option for: ' + selected_orderline.product.display_name),
                    fields: ['name', 'price_extra'],
                    sub_datas: generic_options,
                    sub_search_string: this.pos.db.generic_options,
                    sub_record_by_id: this.pos.generic_option_by_id,
                    multi_choice: true,
                    sub_template: 'GenericOptionList',
                    body: _t('Please select Generic Option for: ' + selected_orderline.product.display_name),
                    confirm: function (generic_option_ids) {
                        if (generic_option_ids.length == 0) {
                            setTimeout(function () {
                                self.ask_cashier_generic_options();
                            }, 1000)
                            return self.pos.chrome.showPopup('ErrorPopup', {
                                title: _t('Warning'),
                                body: _t('Required select one Generic Option')
                            })
                        } else {
                            self.get_selected_orderline().set_generic_options(generic_option_ids);
                        }
                    },
                    cancel: function () {
                        setTimeout(function () {
                            self.ask_cashier_generic_options();
                        }, 1000)
                        return self.pos.chrome.showPopup('ErrorPopup', {
                            title: _t('Warning'),
                            body: _t('Required select one Generic Option')
                        })

                    }
                })
            } else {
                return true
            }
        },
        async popup_add_products_to_cart(product) {
            var self = this;
            var products = this.pos.db.total_variant_by_product_tmpl_id[product.product_tmpl_id]
            var attribute_ids = [];
            var attributes = [];
            for (var i = 0; i < products.length; i++) {
                var product = products[i];
                if (product.product_template_attribute_value_ids) {
                    for (var j = 0; j < product.product_template_attribute_value_ids.length; j++) {
                        var attribute_id = product.product_template_attribute_value_ids[j];
                        if (attribute_ids.indexOf(attribute_id) == -1) {
                            attribute_ids.push(attribute_id)
                            attributes.push(this.pos.attribute_value_by_id[attribute_id])
                        }
                    }
                }
            }
            if (attributes.length && products.length) {
                const {confirmed, payload} = await this.pos.chrome.showPopup('PopUpSelectProductAttributes', {
                    title: this.pos.env._t('Please select Attributes and Values'),
                    products: products,
                    attributes: attributes,
                });
                if (confirmed) {
                    let product_ids = payload.product_ids
                    if (product_ids.length) {
                        product_ids.forEach(function (product_id) {
                            let product = self.pos.db.get_product_by_id(product_id);
                            self.add_product(product, {
                                open_popup: true
                            })
                        });
                    } else {
                        this.pos.chrome.showPopup('ErrorPopup', {
                            title: _t('Alert'),
                            body: _t('Please select one product'),
                        })
                    }
                } else {
                    this.pos.chrome.showPopup('ErrorPopup', {
                        title: _t('Alert'),
                        body: _t('Please select one product'),
                    })
                }
            }
        },
        add_product: function (product, options) {
            if (!options) {
                options = {}
            }
            if (!this.pos.config.allow_add_product) {
                return this.pos.chrome.showPopup('ErrorPopup', {
                    title: this.pos.env._t('Alert'),
                    body: this.pos.env._t('You have not permission add Products')
                })
            }
            if (this.pos.config.allow_select_variant) {
                var total_variants = this.pos.get_count_variant(product.product_tmpl_id)
                if (total_variants.length > 1 && !options.open_popup) {
                    return this.popup_add_products_to_cart(product)
                }
            }

            function check_condition_apply_sale_limit_time(pos, pos_category) {
                if (pos_category.submit_all_pos) {
                    return true
                } else {
                    if (pos_category.pos_branch_ids.length) {
                        if (!pos.config.pos_branch_id) {
                            return true
                        } else {
                            return (pos_category.pos_branch_ids.indexOf(pos.config.pos_branch_id[0]) != -1)
                        }
                    } else {
                        if (pos_category.pos_config_ids) {
                            return (pos_category.pos_config_ids.indexOf(pos.config.id) != -1)
                        } else {
                            return false
                        }
                    }
                }
            }

            if (product && product['pos_categ_id']) {
                var pos_category = this.pos.pos_category_by_id[product['pos_categ_id'][0]];
                if (pos_category && pos_category.sale_limit_time) {
                    var can_apply = check_condition_apply_sale_limit_time(this.pos, pos_category);
                    if (can_apply) {
                        var limit_sale_from_time = pos_category.from_time;
                        var limit_sale_to_time = pos_category.to_time;
                        var date_now = new Date();
                        var current_time = date_now.getHours() + date_now.getMinutes() / 600;
                        if (current_time >= limit_sale_from_time && current_time <= limit_sale_to_time) {
                            return this.pos.chrome.showPopup('ConfirmPopup', {
                                title: this.pos.env._t('Warning'),
                                body: pos_category.name + _(' Only allow sale from time: ' + limit_sale_from_time + ' to time: ' + limit_sale_to_time)
                            })
                        }
                    }
                }
            }
            var res = _super_Order.add_product.apply(this, arguments);
            var selected_orderline = this.get_selected_orderline();
            var combo_items = [];
            if (selected_orderline) {
                // TODO: auto set hardcode combo items
                for (var i = 0; i < this.pos.combo_items.length; i++) {
                    var combo_item = this.pos.combo_items[i];
                    if (combo_item.product_combo_id[0] == selected_orderline.product.product_tmpl_id && (combo_item.default == true || combo_item.required == true)) {
                        combo_items.push(combo_item);
                    }
                }
                if (combo_items) {
                    selected_orderline.set_combo_bundle_pack(combo_items)
                }
                // TODO: auto set dynamic combo items
                if (selected_orderline.product.product_tmpl_id) {
                    var default_combo_items = this.pos.combo_limiteds_by_product_tmpl_id[selected_orderline.product.product_tmpl_id];
                    if (default_combo_items && default_combo_items.length) {
                        var selected_combo_items = {};
                        for (var i = 0; i < default_combo_items.length; i++) {
                            var default_combo_item = default_combo_items[i];
                            if (default_combo_item.default_product_ids.length) {
                                for (var j = 0; j < default_combo_item.default_product_ids.length; j++) {
                                    selected_combo_items[default_combo_item.default_product_ids[j]] = 1
                                }
                            }
                        }
                        selected_orderline.set_dynamic_combo_items(selected_combo_items);
                    }

                }
                if (product.note_ids) {
                    var notes = '';
                    for (var i = 0; i < product.note_ids.length; i++) {
                        var note = this.pos.note_by_id[product.note_ids[i]];
                        if (!notes) {
                            notes = note.name
                        } else {
                            notes += ', ' + note.name;
                        }
                    }
                    if (notes) {
                        selected_orderline.set_line_note(notes)
                    }
                }
                if (product.tag_ids) {
                    selected_orderline.set_tags(product.tag_ids)
                }
            }
            if (this.pos.config.mrp_bom_auto_assign && selected_orderline && selected_orderline.is_has_bom()) {
                var boms = selected_orderline.is_has_bom();
                if (boms.length = 1) {
                    var bom = boms[0]
                    var bom_line_ids = bom.bom_line_ids;
                    var bom_lines = [];
                    for (var i = 0; i < bom_line_ids.length; i++) {
                        bom_lines.push({
                            id: bom_line_ids[i].id,
                            quantity: bom_line_ids[i].product_qty,
                        })
                    }
                    if (bom_lines.length) {
                        selected_orderline.set_bom_lines(bom_lines)
                    }
                }
            }
            const $p = $('article[data-product-id="' + product.id + '"]');
            $($p).animate({
                'opacity': 0.5,
            }, 300, function () {
                $($p).animate({
                    'opacity': 1,
                }, 300);
            });
            var imgtodrag = $p.children('div').find("img").eq(0);
            if (this.pos.config.product_view == 'list') {
                const $p = $('tr[data-product-id="' + product.id + '"]');
                imgtodrag = $p.children('td').find("img")
            }
            let cart_list = $('.pay');
            if (this.pos.env.isMobile) {
                cart_list = $('.btn-switchpane.secondary')
            }
            if (imgtodrag && imgtodrag.length && cart_list && cart_list.length == 1) {
                var imgclone = imgtodrag.clone()
                    .offset({
                        top: imgtodrag.offset().top,
                        left: imgtodrag.offset().left
                    })
                    .css({
                        'opacity': '1',
                        'position': 'absolute',
                        'height': '50px',
                        'width': '150px',
                        'z-index': '100'
                    })
                    .appendTo($('body'))
                    .animate({
                        'top': cart_list.offset().top,
                        'left': cart_list.offset().left,
                        'width': 75,
                        'height': 50
                    }, 1000, 'easeInOutExpo');
                imgclone.animate({
                    'width': 0,
                    'height': 0
                }, function () {
                    $(this).detach()
                });
            }
            return res
        },
        validation_order_can_do_internal_transfer: function () {
            var can_do = true;
            for (var i = 0; i < this.orderlines.models.length; i++) {
                var product = this.orderlines.models[i].product;
                if (product['type'] == 'service' || product['uom_po_id'] == undefined) {
                    can_do = false;
                }
            }
            if (this.orderlines.models.length == 0) {
                can_do = false;
            }
            return can_do;
        },
        update_product_price: function (pricelist) {
            var self = this;
            var products = this.pos.db.get_product_by_category(0);
            if (!products) {
                return;
            }
            for (var i = 0; i < products.length; i++) {
                var product = products[i];
                var price = this.pos.get_price(product, pricelist, 1);
                product['price'] = price;
            }
            self.pos.trigger('product:change_price_list', products)
        },
        get_total_items: function () {
            var total_items = 0;
            for (var i = 0; i < this.orderlines.models.length; i++) {
                total_items += this.orderlines.models[i].quantity;
            }
            return total_items;
        },
        set_tags: function () {
            if (this && this.selected_orderline) {
                var selected_orderline = this.selected_orderline;
                return this.pos.chrome.showPopup('popup_selection_tags', {
                    selected_orderline: selected_orderline,
                    title: this.pos.env._t('Add Tags')
                });
            } else {
                return this.pos.chrome.showPopup('ErrorPopup', {
                    title: this.pos.env._t('Warning'),
                    body: this.pos.env._t('Your shopping cart is empty'),
                })
            }
        },
        set_seller: function () {
            var self = this;
            var sellers = this.pos.sellers;
            return self.pos.chrome.showPopup('popup_selection_extend', {
                title: this.pos.env._t('Select one Seller'),
                fields: ['name', 'email', 'id'],
                sub_datas: sellers,
                sub_template: 'sale_persons',
                body: this.pos.env._t('Please select one sale person'),
                confirm: function (user_id) {
                    var seller = self.pos.user_by_id[user_id];
                    var order = self.pos.get_order();
                    if (order && order.get_selected_orderline()) {
                        return order.get_selected_orderline().set_sale_person(seller)
                    } else {
                        self.pos.chrome.showPopup('ErrorPopup', {
                            title: self.pos.env._t('Warning'),
                            body: self.pos.env._t('Have not Line selected, please select one line before add seller')
                        })
                    }
                }
            })
        },
        change_taxes: function () {
            var order = this;
            var self = this;
            var taxes = [];
            var update_tax_ids = this.pos.config.update_tax_ids || [];
            for (var i = 0; i < this.pos.taxes.length; i++) {
                var tax = this.pos.taxes[i];
                if (update_tax_ids.indexOf(tax.id) != -1) {
                    taxes.push(tax)
                }
            }
            if (order.get_selected_orderline() && taxes.length) {
                var line_selected = order.get_selected_orderline();
                return this.pos.chrome.showPopup('popup_select_tax', {
                    title: self.pos.env._t('Please choose tax'),
                    line_selected: line_selected,
                    taxes: taxes,
                    confirm: function () {
                        return self.pos.gui.close_popup(); // kianh
                    },
                    cancel: function () {
                        return self.pos.gui.close_popup(); // kianh
                    }
                });
            } else {
                return this.pos.chrome.showPopup('ErrorPopup', {
                    title: self.pos.env._t('Warning'),
                    body: ('Please select line before add taxes or update taxes on pos config not setting')
                });
            }
        },
        async create_voucher() {
            var self = this;
            let number = await this.pos._get_voucher_number()
            const {confirmed, payload} = await this.pos.chrome.showPopup('PopUpPrintVoucher', {
                title: _t('Create Voucher'),
                number: number,
                value: 0,
                period_days: this.pos.config.expired_days_voucher,
            });
            if (confirmed) {
                let values = payload.values;
                let error = payload.error;
                if (!error) {
                    let voucher = await rpc.query({
                        model: 'pos.voucher',
                        method: 'create_from_ui',
                        args: [[], values],
                        context: {}
                    })
                    let url_location = window.location.origin + '/report/barcode/EAN13/';
                    voucher['url_barcode'] = url_location + voucher['code'];
                    let report_html = qweb.render('VoucherCard', this.pos._get_voucher_env(voucher));
                    this.pos.chrome.showScreen('ReportScreen', {
                        report_html: report_html
                    });
                } else {
                    self.pos.chrome.showPopup('ErrorPopup', {
                        title: _t('Alert'),
                        body: error,
                    })
                }
            }
        },
        manual_set_promotions: function () {
            var order = this;
            var promotion_manual_select = this.pos.config.promotion_manual_select;
            if (!promotion_manual_select) {
                order.apply_promotion()
            } else {
                var promotion_datas = order.get_promotions_active();
                var promotions_active = promotion_datas['promotions_active'];
                if (promotions_active.length) {
                    return this.pos.chrome.showPopup('popup_selection_promotions', {
                        title: _t('Alert'),
                        body: _t('Please choice promotions need to apply'),
                        promotions_active: promotions_active
                    })
                } else {
                    return this.pos.chrome.showPopup('ErrorPopup', {
                        title: _t('Warning'),
                        body: _t('Nothing Promotions active'),
                    })
                }

            }
        },
        set_redeem_point: function (line, new_price, point) {
            line.redeem_point = round_pr(point, this.pos.loyalty.rounding);
            line.plus_point = 0;
            if (new_price != null) {
                line.price = new_price;
            }
            line.trigger_update_line();
            line.trigger('change', line);
            line.order.trigger('change', line.order)
        },
        async set_reward_program(reward) {
            var loyalty = this.pos.loyalty;
            var product = this.pos.db.get_product_by_id(loyalty.product_loyalty_id[0]);
            if (!product) {
                return this.pos.chrome.showPopup('ErrorPopup', {
                    title: _t('Warning'),
                    body: _t('Could not found product: ' + loyalty.product_loyalty_id[1] + ' on your POS.'),
                })
            }
            var applied = false;
            var lines = this.orderlines.models;
            if (lines.length == 0) {
                return this.pos.chrome.showPopup('ErrorPopup', {
                    title: _t('Warning'),
                    body: _t('Your order is blank cart'),
                })
            }
            var total_with_tax = this.get_total_with_tax();
            var redeem_point_used = this.build_redeem_point();
            var client = this.get_client();
            if (reward['min_amount'] > total_with_tax) {
                return this.pos.chrome.showPopup('ErrorPopup', {
                    title: _t('Warning'),
                    body: 'Reward ' + reward['name'] + ' required min amount bigger than ' + reward['min_amount'],
                })
            }
            if (client['pos_loyalty_point'] <= redeem_point_used) {
                return this.pos.chrome.showPopup('ErrorPopup', {
                    title: _t('Warning'),
                    body: _t('Point of customer not enough'),
                })
            }
            if ((reward['type'] == 'discount_products' || reward['type'] == 'discount_categories') && (reward['discount'] <= 0 || reward['discount'] > 100)) {
                return this.pos.chrome.showPopup('ErrorPopup', {
                    title: _t('Warning'),
                    body: _t('Reward discount required set discount bigger or equal 0 and smaller or equal 100')
                })
            }
            if (reward['type'] == 'discount_products') {
                var point_redeem = 0;
                var amount_total = 0;
                for (var i = 0; i < lines.length; i++) {
                    var line = lines[i];
                    if (reward['discount_product_ids'].indexOf(line['product']['id']) != -1) {
                        amount_total += line.get_price_with_tax();
                    }
                }
                var point_will_redeem = amount_total * reward['discount'] / 100 / reward['coefficient'];
                var price_discount = amount_total * reward['discount'] / 100;
                if ((client['pos_loyalty_point'] > (point_will_redeem + redeem_point_used)) && price_discount) {
                    applied = true;
                    this.add_product(product, {
                        price: price_discount,
                        quantity: -1,
                        merge: false,
                        extras: {
                            reward_id: reward.id,
                            redeem_point: point_will_redeem
                        }
                    });
                }
            } else if (reward['type'] == 'discount_categories') {
                var point_redeem = 0;
                var amount_total = 0;
                for (var i = 0; i < lines.length; i++) {
                    var line = lines[i];
                    if (reward['discount_category_ids'].indexOf(line['product']['pos_categ_id'][0]) != -1) {
                        amount_total += line.get_price_with_tax();
                    }
                }
                var point_will_redeem = amount_total * reward['discount'] / 100 / reward['coefficient'];
                var price_discount = amount_total * reward['discount'] / 100;
                if ((client['pos_loyalty_point'] > (point_will_redeem + redeem_point_used)) && price_discount) {
                    applied = true;
                    this.add_product(product, {
                        price: price_discount,
                        quantity: -1,
                        merge: false,
                        extras: {
                            reward_id: reward.id,
                            redeem_point: point_will_redeem
                        }
                    });
                }
            } else if (reward['type'] == 'gift') {
                for (var item_index in reward['gift_product_ids']) {
                    var product_gift = this.pos.db.get_product_by_id(reward['gift_product_ids'][item_index]);
                    if (product_gift) {
                        var point_will_redeem = product_gift['lst_price'] * reward['coefficient'];
                        if (client['pos_loyalty_point'] > (point_will_redeem + redeem_point_used)) {
                            applied = true;
                            this.add_product(product_gift, {
                                price: 0,
                                quantity: reward['quantity'],
                                merge: false,
                                extras: {
                                    reward_id: reward.id,
                                    redeem_point: point_will_redeem
                                }
                            });
                        }
                    }
                }
            } else if (reward['type'] == 'resale' && reward['price_resale'] > 0) {
                var point_redeem = 0;
                var amount_total = 0;
                for (var i = 0; i < lines.length; i++) {
                    var line = lines[i];
                    if (reward['resale_product_ids'].indexOf(line['product']['id']) != -1) {
                        amount_total += (line.get_price_with_tax() / line.quantity - reward['price_resale']) * line.quantity;
                    }
                }
                var point_will_redeem = amount_total * reward['coefficient'];
                if (client['pos_loyalty_point'] > (point_will_redeem + redeem_point_used)) {
                    applied = true;
                    this.add_product(product, {
                        price: amount_total,
                        quantity: -1,
                        merge: false,
                        extras: {
                            reward_id: reward.id,
                            redeem_point: point_will_redeem
                        }
                    });
                }
            } else if (reward['type'] == 'use_point_payment') {
                var title = 1 / reward['coefficient'] + ' points = 1' + this.pos.currency['name'] + ', Customer have Points: ' + client['pos_loyalty_point'];
                let {confirmed, payload: point} = await this.pos.chrome.showPopup('NumberPopup', {
                    title: title,
                    startingValue: 0
                })
                if (confirmed) {
                    point = parseFloat(point);
                    var redeem_point_used = this.build_redeem_point();
                    var next_redeem_point = redeem_point_used + point;
                    if (point <= 0) {
                        return this.pos.chrome.showPopup('ErrorPopup', {
                            title: _t('Warning'),
                            body: _t('Points redeem required bigger than 0')
                        })
                    }
                    if (client['pos_loyalty_point'] < next_redeem_point) {
                        return this.pos.chrome.showPopup('ErrorPopup', {
                            title: _t('Warning'),
                            body: _t('Customer not enough points')
                        })

                    } else {
                        var next_amount = total_with_tax - (point * reward['coefficient']);
                        if (next_amount >= 0) {
                            applied = true;
                            this.add_product(product, {
                                price: point * reward['coefficient'],
                                quantity: -1,
                                merge: false,
                                extras: {
                                    reward_id: reward.id,
                                    redeem_point: point
                                },
                            });
                        } else {
                            return this.pos.chrome.showPopup('ConfirmPopup', {
                                title: _t('Warning'),
                                body: _t('Max point can add is ') + (total_with_tax / reward['coefficient']).toFixed(1),
                            });
                        }
                    }
                }
            }
        },
        lock_order: function () {
            var self = this;
            var order = this;
            if (order && order.table) {
                this.pos.table_click = order.table;
                var table_will_lock = _.find(this.pos.gui.screen_instances['floors'].floor.tables, function (tb) {
                    return tb.id == self.pos.table_click.id
                })
                if (table_will_lock) {
                    table_will_lock.locked = true;
                }
                rpc.query({
                    model: 'restaurant.table',
                    method: 'lock_table',
                    args: [[order.table.id], {
                        'locked': true,
                    }],
                }).then(function () {
                    self.pos.set_order(null);
                    self.pos.gui.show_screen('floors');
                })
            }
            if (this.pos.pos_bus) {
                this.pos.pos_bus.send_notification({
                    data: {
                        order: order.export_as_JSON(),
                        table_id: order.table.id,
                        order_uid: order.uid,
                        lock: true,
                    },
                    action: 'lock_table',
                    order_uid: order.uid,
                })
            }
        },
        create_sale_order: function () {
            var order = this;
            var length = order.orderlines.length;
            if (!order.get_client()) {
                return this.pos.show_popup_clients('products');
            }
            if (length == 0) {
                return this.pos.chrome.showPopup('ErrorPopup', {
                    title: _t('Warning'),
                    body: _t('Your order is blank cart'),
                });
            }
            if (order.get_total_with_tax() <= 0) {
                return this.pos.chrome.showPopup('ConfirmPopup', {
                    title: _t('Warning'),
                    body: _t("Amount total of order required bigger than 0"),
                });
            }
            return this.pos.chrome.showPopup('popup_create_sale_order', {
                title: _t('Create Quotation/Sale Order'),
            });
        },

        // TODO: Promotion
        get_promotions_active: function () {
            if (this.is_return) {
                return {
                    can_apply: false,
                    promotions_active: []
                };
            }
            var can_apply = null;
            var promotions_active = [];
            if (!this.pos.promotions) {
                return {
                    can_apply: can_apply,
                    promotions_active: []
                };
            }
            for (var i = 0; i < this.pos.promotions.length; i++) {
                var promotion = this.pos.promotions[i];
                if (!this._checking_period_times_condition(promotion)) {
                    continue
                }
                var is_special_customer = this.checking_special_client(promotion);
                var is_birthday_customer = this.checking_promotion_birthday_match_birthdayof_client(promotion);
                var is_mem_of_promotion_group = this.checking_promotion_has_groups(promotion);
                if (promotion['type'] == '1_discount_total_order' && this.checking_apply_total_order(promotion) && is_special_customer && is_birthday_customer && is_mem_of_promotion_group) {
                    can_apply = true;
                    promotions_active.push(promotion);
                } else if (promotion['type'] == '2_discount_category' && this.checking_can_discount_by_categories(promotion) && is_special_customer && is_birthday_customer && is_mem_of_promotion_group) {
                    can_apply = true;
                    promotions_active.push(promotion);
                } else if (promotion['type'] == '3_discount_by_quantity_of_product' && this.checking_apply_discount_filter_by_quantity_of_product(promotion) && is_special_customer && is_birthday_customer && is_mem_of_promotion_group) {
                    can_apply = true;
                    promotions_active.push(promotion);
                } else if (promotion['type'] == '4_pack_discount' && is_special_customer && is_birthday_customer && is_mem_of_promotion_group) {
                    var promotion_condition_items = this.pos.promotion_discount_condition_by_promotion_id[promotion.id];
                    if (!promotion_condition_items) {
                        console.warn(promotion.name + 'have not rules');
                        continue
                    }
                    var checking_pack_discount_and_pack_free = this.checking_pack_discount_and_pack_free_gift(promotion, promotion_condition_items);
                    if (checking_pack_discount_and_pack_free) {
                        can_apply = true;
                        promotions_active.push(promotion);
                    }
                } else if (promotion['type'] == '5_pack_free_gift' && is_special_customer && is_birthday_customer && is_mem_of_promotion_group) {
                    var promotion_condition_items = this.pos.promotion_gift_condition_by_promotion_id[promotion.id];
                    if (!promotion_condition_items) {
                        console.warn(promotion.name + 'have not rules');
                        continue
                    }
                    var checking_pack_discount_and_pack_free = this.checking_pack_discount_and_pack_free_gift(promotion, promotion_condition_items);
                    if (checking_pack_discount_and_pack_free) {
                        can_apply = checking_pack_discount_and_pack_free;
                        promotions_active.push(promotion);
                    }
                } else if (promotion['type'] == '6_price_filter_quantity' && this.checking_apply_price_filter_by_quantity_of_product(promotion) && is_special_customer && is_birthday_customer && is_mem_of_promotion_group) {
                    can_apply = true;
                    promotions_active.push(promotion);
                } else if (promotion['type'] == '7_special_category' && this.checking_apply_specical_category(promotion) && is_special_customer && is_birthday_customer && is_mem_of_promotion_group) {
                    can_apply = true;
                    promotions_active.push(promotion);
                } else if (promotion['type'] == '8_discount_lowest_price' && is_special_customer && is_birthday_customer && is_mem_of_promotion_group) {
                    can_apply = true;
                    promotions_active.push(promotion);
                } else if (promotion['type'] == '9_multi_buy' && is_special_customer && is_birthday_customer && is_mem_of_promotion_group) {
                    var check_multi_by = this.checking_multi_buy(promotion);
                    if (check_multi_by) {
                        can_apply = check_multi_by;
                        promotions_active.push(promotion);
                    }
                } else if (promotion['type'] == '10_buy_x_get_another_free' && this.checking_special_client(promotion) && this.checking_promotion_birthday_match_birthdayof_client(promotion)) {
                    var check_by_x_get_another_free = this.checking_buy_x_get_another_free(promotion);
                    if (check_by_x_get_another_free) {
                        can_apply = check_by_x_get_another_free;
                        promotions_active.push(promotion);
                    }
                } else if (promotion['type'] == '11_first_order' && this.checking_special_client(promotion) && this.checking_promotion_birthday_match_birthdayof_client(promotion)) {
                    var can_apply_promotion = this.checking_first_order_of_customer(promotion);
                    if (can_apply_promotion) {
                        can_apply = can_apply_promotion;
                        promotions_active.push(promotion);
                    }
                } else if (promotion['type'] == '12_buy_total_items_free_items' && this.checking_special_client(promotion) && this.checking_promotion_birthday_match_birthdayof_client(promotion)) {
                    var product_ids = promotion.product_ids;
                    if (!product_ids || product_ids.length == 0) {
                        console.warn(promotion.name + ' product_ids not set');
                        continue
                    }
                    var can_apply_promotion = this.checking_buy_total_items_free_items(promotion);
                    if (can_apply_promotion) {
                        can_apply = can_apply_promotion;
                        promotions_active.push(promotion);
                    }
                } else if (promotion['type'] == '13_gifts_filter_by_total_amount' && this.checking_special_client(promotion) && this.checking_promotion_birthday_match_birthdayof_client(promotion)) {
                    var can_apply_promotion = this.checking_gifts_filter_by_total_amount(promotion);
                    if (can_apply_promotion) {
                        can_apply = can_apply_promotion;
                        promotions_active.push(promotion);
                    }
                }
            }
            return {
                can_apply: can_apply,
                promotions_active: promotions_active
            };
        },
        apply_promotion: function (promotions) {
            if (this.is_return) {
                return this.pos.chrome.showPopup('ConfirmPopup', {
                    title: _t('Warning'),
                    body: _t('Return order not allow apply promotions'),
                });
            }
            if (!promotions) {
                promotions = this.get_promotions_active()['promotions_active'];
            }
            if (promotions.length) {
                this.remove_all_promotion_line();
                for (var i = 0; i < promotions.length; i++) {
                    var type = promotions[i].type
                    var order = this;
                    if (order.orderlines.length) {
                        if (type == '1_discount_total_order') {
                            order.compute_discount_total_order(promotions[i]);
                        }
                        if (type == '2_discount_category') {
                            order.compute_discount_category(promotions[i]);
                        }
                        if (type == '3_discount_by_quantity_of_product') {
                            order.compute_discount_by_quantity_of_products(promotions[i]);
                        }
                        if (type == '4_pack_discount') {
                            order.compute_pack_discount(promotions[i]);
                        }
                        if (type == '5_pack_free_gift') {
                            order.compute_pack_free_gift(promotions[i]);
                        }
                        if (type == '6_price_filter_quantity') {
                            order.compute_price_filter_quantity(promotions[i]);
                        }
                        if (type == '7_special_category') {
                            order.compute_special_category(promotions[i]);
                        }
                        if (type == '8_discount_lowest_price') {
                            order.compute_discount_lowest_price(promotions[i]);
                        }
                        if (type == '9_multi_buy') {
                            order.compute_multi_buy(promotions[i]);
                        }
                        if (type == '10_buy_x_get_another_free') {
                            order.compute_buy_x_get_another_free(promotions[i]);
                        }
                        if (type == '11_first_order') {
                            order.compute_first_order(promotions[i]);
                        }
                        if (type == '12_buy_total_items_free_items') {
                            order.compute_buy_total_items_free_items(promotions[i]);
                        }
                        if (type == '13_gifts_filter_by_total_amount') {
                            order.compute_gifts_filter_by_total_amount(promotions[i]);
                        }
                    }
                }
                var applied_promotion = false;
                var total_promotion_line = 0;
                for (var i = 0; i < this.orderlines.models.length; i++) {
                    if (this.orderlines.models[i]['promotion'] == true) {
                        applied_promotion = true;
                        total_promotion_line += 1;
                    }
                }
                this.trigger('change', this);
            } else {
                return this.pos.chrome.showPopup('ConfirmPopup', {
                    title: _t('Warning'),
                    body: _t('Have not any Promotions Active'),
                });
            }
        },
        get_amount_total_without_promotion: function () {
            var lines = _.filter(this.orderlines.models, function (line) {
                return !line['is_return'] && !line['promotion']
            });
            var amount_total = 0;
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i];
                if (this.pos.config.iface_tax_included === 'total') {
                    amount_total += line.get_price_with_tax();
                } else {
                    amount_total += line.get_price_without_tax();
                }
            }
            return amount_total;
        },
        remove_all_buyer_promotion_line: function () {
            var lines = this.orderlines.models;
            for (var n = 0; n < 2; n++) {
                for (var i = 0; i < lines.length; i++) {
                    var line = lines[i];
                    if (line['buyer_promotion']) {
                        this.orderlines.remove(line);
                    }
                }
            }
        },
        remove_all_promotion_line: function () {
            var lines = this.orderlines.models;
            for (var n = 0; n < 2; n++) {
                for (var i = 0; i < lines.length; i++) {
                    var line = lines[i];
                    if (line['promotion']) {
                        if (line.promotion && line.promotion_id && (line.promotion_discount || line.promotion_amount)) {
                            line.promotion = false;
                            line.promotion_id = null;
                            line.promotion_discount = null;
                            line.promotion_amount = null;
                            line.promotion_reason = null;
                            line.trigger('change', line)
                        } else {
                            this.orderlines.remove(line);
                        }
                    }
                }
            }
        },
        product_quantity_by_product_id: function () {
            var lines_list = {};
            var lines = this.orderlines.models;
            var i = 0;
            while (i < lines.length) {
                var line = lines[i];
                if (line.promotion) {
                    i++;
                    continue
                }
                if (!lines_list[line.product.id]) {
                    lines_list[line.product.id] = line.quantity;
                } else {
                    lines_list[line.product.id] += line.quantity;
                }
                i++;
            }
            return lines_list
        },
        total_price_by_product_id: function () {
            var total_price_by_product = {};
            for (var i = 0; i < this.orderlines.models.length; i++) {
                var line = this.orderlines.models[i];
                if (this.pos.config.iface_tax_included === 'total') {
                    if (!total_price_by_product[line.product.id]) {
                        total_price_by_product[line.product.id] = line.get_price_with_tax();
                    } else {
                        total_price_by_product[line.product.id] += line.get_price_with_tax();
                    }
                } else {
                    if (!total_price_by_product[line.product.id]) {
                        total_price_by_product[line.product.id] = line.get_price_without_tax();
                    } else {
                        total_price_by_product[line.product.id] += line.get_price_without_tax();
                    }
                }
            }
            return total_price_by_product;
        },
        checking_special_client: function (promotion) {
            /*
                Checking client selected have inside special customers of promotion
             */
            if (!promotion.special_customer_ids || promotion.special_customer_ids.length == 0) {
                return true
            } else {
                var order = this.pos.get_order();
                if (!order) {
                    return true
                } else {
                    var client = order.get_client();
                    if (!client && promotion.special_customer_ids.length) {
                        return false
                    } else {
                        var client_id = client.id;
                        if (promotion.special_customer_ids.indexOf(client_id) == -1) {
                            return false
                        } else {
                            return true
                        }
                    }
                }
            }
        },
        checking_promotion_birthday_match_birthdayof_client: function (promotion) {
            /*
                We checking 2 condition
                1. Promotion is promotion birthday
                2. Birthday of client isnide period time of promotion allow
             */
            if (!promotion.promotion_birthday) {
                return true
            } else {
                var client = this.get_client();
                var passed = false;
                if (client && client['birthday_date']) {
                    var birthday_date = moment(client['birthday_date']);
                    var today = moment(new Date());
                    if (promotion['promotion_birthday_type'] == 'day') {
                        if ((birthday_date.date() == today.date()) && (birthday_date.month() == today.month())) {
                            passed = true
                        }
                    }
                    if (promotion['promotion_birthday_type'] == 'week') {
                        var parts = client['birthday_date'].split('-');
                        var birthday_date = new Date(new Date().getFullYear() + '-' + parts[1] + '-' + parts[0]).getTime() + 86400000;
                        var startOfWeek = moment().startOf('week').toDate().getTime() + 86400000;
                        var endOfWeek = moment().endOf('week').toDate().getTime() + 86400000;
                        if (startOfWeek <= birthday_date && birthday_date <= endOfWeek) {
                            passed = true;
                        }
                    }
                    if (promotion['promotion_birthday_type'] == 'month') {
                        if (birthday_date.month() == today.month()) {
                            passed = true
                        }
                    }
                }
                return passed;
            }
        },
        checking_promotion_has_groups: function (promotion) {
            /*
                We checking 2 condition
                1. Promotion is promotion birthday
                2. Birthday of client isnide period time of promotion allow
             */
            if (!promotion.promotion_group) {
                return true
            } else {
                var client = this.get_client();
                var passed = false;
                if (promotion.promotion_group_ids.length && client && client.group_ids) {
                    for (var i = 0; i < client.group_ids.length; i++) {
                        var group_id = client.group_ids[i];
                        if (promotion['promotion_group_ids'].indexOf(group_id) != -1) {
                            passed = true;
                            break;
                        }
                    }
                }
                return passed;
            }
        },
        order_has_promotion_applied: function () {
            var promotion_line = _.find(this.orderlines.models, function (line) {
                return line.promotion == true;
            });
            if (promotion_line) {
                return true
            } else {
                return false
            }
        },
        // 1) check current order can apply discount by total order
        checking_apply_total_order: function (promotion) {
            var can_apply = false;
            var discount_lines = this.pos.promotion_discount_order_by_promotion_id[promotion.id];
            var total_order = this.get_amount_total_without_promotion();
            var discount_line_tmp = null;
            var discount_tmp = 0;
            if (discount_lines) {
                var i = 0;
                while (i < discount_lines.length) {
                    var discount_line = discount_lines[i];
                    if (total_order >= discount_line.minimum_amount && total_order >= discount_tmp) {
                        discount_line_tmp = discount_line;
                        discount_tmp = discount_line.minimum_amount
                        can_apply = true
                    }
                    i++;
                }
            }
            return can_apply && this.checking_special_client(promotion);
        },
        // 2) check current order can apply discount by categories
        checking_can_discount_by_categories: function (promotion) {
            var can_apply = false;
            var product = this.pos.db.get_product_by_id(promotion.product_id[0]);
            if (!product || !this.pos.promotion_by_category_id) {
                return false;
            }
            for (var i in this.pos.promotion_by_category_id) {
                var promotion_line = this.pos.promotion_by_category_id[i];
                var amount_total_by_category = 0;
                var z = 0;
                var lines = _.filter(this.orderlines.models, function (line) {
                    return !line['is_return'] && !line['promotion']
                });
                while (z < lines.length) {
                    if (!lines[z].product.pos_categ_id) {
                        z++;
                        continue;
                    }
                    if (lines[z].product.pos_categ_id[0] == promotion_line.category_id[0]) {
                        amount_total_by_category += lines[z].get_price_without_tax();
                    }
                    z++;
                }
                if (amount_total_by_category > 0) {
                    can_apply = true
                }
            }
            return can_apply && this.checking_special_client(promotion)
        },
        // 3_discount_by_quantity_of_product
        checking_apply_discount_filter_by_quantity_of_product: function (promotion) {
            var can_apply = false;
            var rules = this.pos.promotion_quantity_by_product_id;
            var product_quantity_by_product_id = this.product_quantity_by_product_id();
            for (var product_id in product_quantity_by_product_id) {
                var rules_by_product_id = rules[product_id];
                if (rules_by_product_id) {
                    for (var i = 0; i < rules_by_product_id.length; i++) {
                        var rule = rules_by_product_id[i];
                        if (rule && rule['promotion_id'][0] == promotion['id'] && product_quantity_by_product_id[product_id] >= rule.quantity) {
                            can_apply = true;
                        }
                    }
                }
            }
            return can_apply && this.checking_special_client(promotion);
        },
        // 4. & 5. : check pack free gift and pack discount product
        // 5_pack_free_gift && 4_pack_discount
        checking_pack_discount_and_pack_free_gift: function (promotion, rules) {
            var method = promotion.method;
            var active_one = false;
            var can_apply = true;
            var product_quantity_by_product_id = this.product_quantity_by_product_id();
            for (var i = 0; i < rules.length; i++) {
                var rule = rules[i];
                var product_id = rule.product_id[0];
                var minimum_quantity = rule.minimum_quantity;
                var total_qty_by_product = product_quantity_by_product_id[product_id];
                if ((total_qty_by_product && total_qty_by_product < minimum_quantity) || !total_qty_by_product) {
                    can_apply = false;
                }
                if (total_qty_by_product && total_qty_by_product >= minimum_quantity) {
                    active_one = true;
                }
            }
            if (active_one && method == 'only_one') {
                return active_one && this.checking_special_client(promotion)
            } else {
                return can_apply && this.checking_special_client(promotion)
            }
        },
        // 6. check condition for apply price filter by quantity of product
        checking_apply_price_filter_by_quantity_of_product: function (promotion) {
            var condition = false;
            var rules = this.pos.promotion_price_by_promotion_id[promotion.id];
            var product_quantity_by_product_id = this.product_quantity_by_product_id();
            for (var i = 0; i < rules.length; i++) {
                var rule = rules[i];
                if (rule && product_quantity_by_product_id[rule.product_id[0]] && product_quantity_by_product_id[rule.product_id[0]] >= rule.minimum_quantity) {
                    condition = true;
                }
            }
            return condition && this.checking_special_client(promotion);
        },
        // 7. checking promotion special category
        checking_apply_specical_category: function (promotion) {
            var condition = false;
            var promotion_lines = this.pos.promotion_special_category_by_promotion_id[promotion['id']];
            this.lines_by_category_id = {};
            for (var i = 0; i < this.orderlines.models.length; i++) {
                var line = this.orderlines.models[i];
                var pos_categ_id = line['product']['pos_categ_id'][0];
                if (pos_categ_id) {
                    if (!this.lines_by_category_id[pos_categ_id]) {
                        this.lines_by_category_id[pos_categ_id] = [line]
                    } else {
                        this.lines_by_category_id[pos_categ_id].push(line)
                    }
                }
            }
            for (var i = 0; i < promotion_lines.length; i++) {
                var promotion_line = promotion_lines[i];
                var categ_id = promotion_line['category_id'][0];
                var total_quantity = 0;

                if (this.lines_by_category_id[categ_id]) {
                    var total_quantity = 0;
                    for (var i = 0; i < this.lines_by_category_id[categ_id].length; i++) {
                        total_quantity += this.lines_by_category_id[categ_id][i]['quantity']
                    }
                    if (promotion_line['count'] <= total_quantity) {
                        condition = true;
                    }
                }
            }
            return condition && this.checking_special_client(promotion);
        },
        // 9. checking multi buy
        // TODO: 9_multi_buy
        checking_multi_buy: function (promotion) {
            var can_apply = false;
            var method = promotion.method;
            var rules = this.pos.multi_buy_by_promotion_id[promotion.id];
            var total_qty_by_product = this.product_quantity_by_product_id();
            if (rules) {
                for (var i = 0; i < rules.length; i++) {
                    var rule = rules[i];
                    var product_ids = rule.product_ids;
                    var total_qty_exist = 0;
                    for (var index in product_ids) {
                        var product_id = product_ids[index];
                        if (total_qty_by_product[product_id]) {
                            total_qty_exist += total_qty_by_product[product_id]
                        }
                    }
                    if (total_qty_exist >= rule['qty_apply']) {
                        can_apply = true;
                        break
                    }
                }
            }
            return can_apply && this.checking_special_client(promotion);
        },
        // 10. by x (qty) get y (qty) free
        checking_buy_x_get_another_free: function (promotion) {
            var can_apply = false;
            var minimum_items = promotion['minimum_items'];
            var total_quantity = this.product_quantity_by_product_id();
            for (var index_id in promotion.product_ids) {
                var product_id = promotion.product_ids[index_id];
                if (total_quantity[product_id] && total_quantity[product_id] >= minimum_items) {
                    var product = this.pos.db.product_by_id[product_id];
                    if (product) {
                        can_apply = true;
                        break
                    }
                }
            }
            return can_apply && this.checking_special_client(promotion);
        },
        // 11. checking first order of customer
        checking_first_order_of_customer: function (promotion) {
            var order;
            if (this.get_client()) {
                var client = this.get_client();
                order = _.filter(this.pos.db.get_pos_orders(), function (order) {
                    return order.partner_id && order.partner_id[0] == client['id']
                });
                if (order.length == 0) {
                    return true && this.checking_special_client(promotion)
                } else {
                    return false && this.checking_special_client(promotion)
                }
            } else {
                return false && this.checking_special_client(promotion)
            }
        },
        compute_discount_total_order: function (promotion) { // TODO: 1_discount_total_order
            var discount_lines = this.pos.promotion_discount_order_by_promotion_id[promotion.id];
            var total_order = this.get_amount_total_without_promotion();
            var discount_line_tmp = null;
            var discount_tmp = 0;
            if (discount_lines) {
                var i = 0;
                while (i < discount_lines.length) {
                    var discount_line = discount_lines[i];
                    if (total_order >= discount_line.minimum_amount && total_order >= discount_tmp) {
                        discount_line_tmp = discount_line;
                        discount_tmp = discount_line.minimum_amount;
                    }
                    i++;
                }
            }
            if (!discount_line_tmp) {
                return false;
            }
            var total_order = this.get_amount_total_without_promotion();
            if (discount_line_tmp && total_order > 0) {
                var promotion_reason = promotion.name;
                var lines = _.filter(this.orderlines.models, function (line) {
                    return !line['is_return'] && !line['promotion']
                });
                this._apply_promotion_to_orderlines(lines, promotion.id, promotion_reason, 0, discount_line_tmp.discount)
            }
        },
        //TODO: 12_buy_total_items_free_items
        checking_buy_total_items_free_items: function (promotion) {
            var total_items_ofRules_inCart = 0;
            var product_quantity_by_product_id = this.product_quantity_by_product_id();
            for (var i = 0; i < promotion.product_ids.length; i++) {
                var product_id = promotion.product_ids[i];
                var total_qty_by_product = product_quantity_by_product_id[product_id];
                if (total_qty_by_product) {
                    total_items_ofRules_inCart += total_qty_by_product
                }
            }
            if (total_items_ofRules_inCart && total_items_ofRules_inCart >= promotion.minimum_items) {
                return true && this.checking_special_client(promotion)
            } else {
                return false && this.checking_special_client(promotion)
            }
        },
        //TODO: 13_gifts_filter_by_total_amount
        checking_gifts_filter_by_total_amount: function (promotion) {
            var total_order = this.get_amount_total_without_promotion();
            if (total_order > 0 && promotion.amount_total && total_order >= promotion.amount_total) {
                return true && this.checking_special_client(promotion)
            } else {
                return false && this.checking_special_client(promotion)
            }
        },
        compute_discount_category: function (promotion) { // TODO: 2_discount_category
            var product = this.pos.db.get_product_by_id(promotion.product_id[0]);
            if (!product || !this.pos.promotion_by_category_id) {
                return false;
            }
            for (var i in this.pos.promotion_by_category_id) {
                var promotion_line = this.pos.promotion_by_category_id[i];
                var lines = this.orderlines.models;
                for (var i = 0; i < lines.length; i++) {
                    var line = lines[i];
                    if (line.promotion || line.product.pos_categ_id[0] != promotion_line.category_id[0]) {
                        continue
                    } else {
                        var promotion_reason = 'Category: ' + promotion_line.category_id[1];
                        var promotion_discount = promotion_line.discount;
                        this._apply_promotion_to_orderlines([line], promotion.id, promotion_reason, 0, promotion_discount);

                    }
                }
            }
        },
        compute_discount_by_quantity_of_products: function (promotion) { //TODO: 3_discount_by_quantity_of_product
            var quantity_by_product_id = this.product_quantity_by_product_id();
            var orderlines = this.orderlines.models;
            for (var product_id in quantity_by_product_id) {
                var promotion_lines = this.pos.promotion_quantity_by_product_id[product_id];
                if (!promotion_lines) {
                    continue;
                }
                var quantity_tmp = 0;
                var promotion_line = null;
                for (var index in promotion_lines) {
                    promotion_line = promotion_lines[index]
                    var condition = quantity_tmp <= promotion_line.quantity && quantity_by_product_id[product_id] >= promotion_line.quantity;
                    if (condition && promotion_line['product_id'][0] == product_id && promotion_line['promotion_id'][0] == promotion['id']) {
                        promotion_line = promotion_line;
                        quantity_tmp = promotion_line.quantity
                    }
                }
                if (promotion_line) {
                    var orderlines_promotion = _.filter(orderlines, function (orderline) {
                        return orderline.product.id == promotion_line.product_id[0];
                    });
                    if (orderlines_promotion) {
                        var promotion_reason = promotion_line.product_id[1] + ' have quantity greater or equal ' + promotion_line.quantity;
                        var promotion_discount = promotion_line.discount;
                        this._apply_promotion_to_orderlines(orderlines_promotion, promotion.id, promotion_reason, 0, promotion_discount);
                    }
                }
            }
        },
        count_quantity_by_product: function (product) {
            /*
                Function return total qty filter by product of order
            */
            var qty = 0;
            for (var i = 0; i < this.orderlines.models.length; i++) {
                var line = this.orderlines.models[i];
                if (line.product['id'] == product['id']) {
                    qty += line['quantity'];
                }
            }
            return qty;
        },
        compute_pack_discount: function (promotion) { // TODO: 4_pack_discount
            var discount_items = this.pos.promotion_discount_apply_by_promotion_id[promotion.id];
            if (!discount_items) {
                return;
            }
            var lines = _.filter(this.orderlines.models, function (line) {
                return !line['is_return'] && !line['promotion']
            });
            for (var n = 0; n < discount_items.length; n++) {
                var discount_item = discount_items[n];
                for (var i = 0; i < lines.length; i++) {
                    var line = lines[i];
                    if (line.product.id == discount_item.product_id[0]) {
                        var promotion_reason = promotion.name;
                        var promotion_discount = discount_item.discount;
                        this._apply_promotion_to_orderlines([line], promotion.id, promotion_reason, 0, promotion_discount);
                    }
                }
            }
        },
        compute_pack_free_gift: function (promotion) { // TODO: 5_pack_free_gift
            var gifts = this.pos.promotion_gift_free_by_promotion_id[promotion.id];
            if (!gifts) {
                console.warn('gifts not found');
                return;
            }
            var condition_items = this.pos.promotion_gift_condition_by_promotion_id[promotion.id];
            var max_qty_of_gift = null;
            var min_qty_of_condition = null;
            var current_qty = null;
            for (var i = 0; i < gifts.length; i++) {
                var gift = gifts[i];
                if (!max_qty_of_gift) {
                    max_qty_of_gift = gift.quantity_free;
                }
                if (max_qty_of_gift && max_qty_of_gift <= gift.quantity_free) {
                    max_qty_of_gift = gift.quantity_free;
                }
            }
            for (var i = 0; i < condition_items.length; i++) {
                var condition_item = condition_items[i];
                if (!min_qty_of_condition) {
                    min_qty_of_condition = condition_item.minimum_quantity;
                }
                if (min_qty_of_condition && min_qty_of_condition >= condition_item.minimum_quantity) {
                    min_qty_of_condition = condition_item.minimum_quantity
                }
                var product = this.pos.db.get_product_by_id(condition_item.product_id[0]);
                if (product) {
                    var total_qty = this.count_quantity_by_product(product);
                    if (total_qty) {
                        if (!current_qty) {
                            current_qty = total_qty
                        }
                        if (promotion.method == 'only_one') {
                            if (current_qty && total_qty >= current_qty) {
                                current_qty = total_qty
                            }
                        } else {
                            if (current_qty && total_qty <= current_qty) {
                                current_qty = total_qty
                            }
                        }

                    }
                }
            }
            if (min_qty_of_condition == 0) {
                min_qty_of_condition = 1
            }
            if (max_qty_of_gift == 0) {
                max_qty_of_gift = 1
            }
            // TODO: buy min_qty_of_condition (A) will have max_qty_of_gift (B)
            // TODO: buy current_qty (C) will have X (qty): x = C / A * B
            var temp = parseInt(current_qty / min_qty_of_condition * max_qty_of_gift);
            if (temp == 0) {
                temp = 1;
            }
            var i = 0;
            while (i < gifts.length) {
                var gift = gifts[i];
                var product = this.pos.db.get_product_by_id(gift.product_id[0]);
                if (product) {
                    var qty_free = gift.quantity_free;
                    if (gift['type'] !== 'only_one') {
                        qty_free = qty_free * temp
                    }
                    this.add_promotion_gift(product, 0, qty_free, {
                        promotion: true,
                        promotion_gift: true,
                        promotion_reason: promotion.name
                    })
                } else {
                    this.pos.chrome.showPopup('ConfirmPopup', {
                        title: _t('Warning'),
                        body: gift.product_id[1] + _t(' not available in POS, please contact your admin')
                    })
                }
                i++;
            }
        },
        compute_price_filter_quantity: function (promotion) { // TODO: 6_price_filter_quantity
            var promotion_prices = this.pos.promotion_price_by_promotion_id[promotion.id];
            if (promotion_prices) {
                var prices_item_by_product_id = {};
                for (var i = 0; i < promotion_prices.length; i++) {
                    var item = promotion_prices[i];
                    if (!prices_item_by_product_id[item.product_id[0]]) {
                        prices_item_by_product_id[item.product_id[0]] = [item]
                    } else {
                        prices_item_by_product_id[item.product_id[0]].push(item)
                    }
                }
                var quantity_by_product_id = this.product_quantity_by_product_id();
                for (i in quantity_by_product_id) {
                    if (prices_item_by_product_id[i]) {
                        var quantity_tmp = 0;
                        var price_item_tmp = null;
                        for (var j = 0; j < prices_item_by_product_id[i].length; j++) {
                            var price_item = prices_item_by_product_id[i][j];
                            if (quantity_by_product_id[i] >= price_item.minimum_quantity && quantity_by_product_id[i] >= quantity_tmp) {
                                quantity_tmp = price_item.minimum_quantity;
                                price_item_tmp = price_item;
                            }
                        }
                        if (price_item_tmp) {
                            var lines = _.filter(this.orderlines.models, function (line) {
                                return !line['is_return'] && !line['promotion'] && line.product.id == price_item_tmp.product_id[0];
                            });
                            var promotion_reason = promotion.name;
                            var promotion_amount = price_item_tmp.price_down;
                            this._apply_promotion_to_orderlines(lines, promotion.id, promotion_reason, promotion_amount, 0);
                        }
                    }
                }
            }
        },
        compute_special_category: function (promotion) { // TODO: 7_special_category
            var promotion_lines = this.pos.promotion_special_category_by_promotion_id[promotion['id']];
            this.lines_by_category_id = {};
            for (var i = 0; i < this.orderlines.models.length; i++) {
                var line = this.orderlines.models[i];
                if (line.promotion) {
                    continue;
                }
                var pos_categ_id = line['product']['pos_categ_id'][0]
                if (pos_categ_id) {
                    if (!this.lines_by_category_id[pos_categ_id]) {
                        this.lines_by_category_id[pos_categ_id] = [line]
                    } else {
                        this.lines_by_category_id[pos_categ_id].push(line)
                    }
                }
            }
            for (var i = 0; i < promotion_lines.length; i++) {
                var promotion_line = promotion_lines[i];
                var categ_id = promotion_line['category_id'][0];
                if (this.lines_by_category_id[categ_id]) {
                    var total_quantity = 0;
                    for (var i = 0; i < this.lines_by_category_id[categ_id].length; i++) {
                        total_quantity += this.lines_by_category_id[categ_id][i]['quantity']
                    }
                    if (promotion_line['count'] <= total_quantity) {
                        var promotion_type = promotion_line['type'];
                        if (promotion_type == 'discount') {
                            var promotion_reason = promotion.name;
                            var promotion_discount = promotion_line.price_down;
                            this._apply_promotion_to_orderlines(lines, promotion.id, promotion_reason, 0, promotion_discount);
                        }
                        if (promotion_type == 'free') {
                            var product_free = this.pos.db.product_by_id[promotion_line['product_id'][0]];
                            if (product_free) {
                                this.add_promotion_gift(product_free, 0, promotion_line['qty_free'], {
                                    promotion: true,
                                    promotion_id: promotion.id,
                                    promotion_reason: 'Buy bigger than or equal ' + promotion_line['count'] + ' product of ' + promotion_line['category_id'][1] + ' free ' + promotion_line['qty_free'] + ' ' + product_free['display_name']
                                })
                            }
                        }
                    }
                }
            }
        },
        compute_discount_lowest_price: function (promotion) { // TODO: 8_discount_lowest_price
            var orderlines = this.orderlines.models;
            var line_apply = null;
            for (var i = 0; i < orderlines.length; i++) {
                var line = orderlines[i];
                if (!line_apply) {
                    line_apply = line
                } else {
                    if (line.get_price_with_tax() < line_apply.get_price_with_tax()) {
                        line_apply = line;
                    }
                }
            }
            var product_discount = this.pos.db.product_by_id[promotion.product_id[0]];
            if (line_apply && product_discount) {
                var promotion_reason = promotion.name;
                var promotion_discount = promotion.discount_lowest_price;
                this._apply_promotion_to_orderlines([line_apply], promotion.id, promotion_reason, 0, promotion_discount);
            }
        },
        _get_rules_apply_multi_buy: function (promotion) {
            var rules_apply = [];
            var rules = this.pos.multi_buy_by_promotion_id[promotion.id];
            var total_qty_by_product = this.product_quantity_by_product_id();
            if (rules) {
                for (var i = 0; i < rules.length; i++) {
                    var rule = rules[i];
                    var product_ids = rule.product_ids;
                    var total_qty_exist = 0;
                    for (var index in product_ids) {
                        var product_id = product_ids[index];
                        if (total_qty_by_product[product_id]) {
                            total_qty_exist += total_qty_by_product[product_id]
                        }
                    }
                    if (total_qty_exist >= rule['qty_apply']) {
                        rules_apply.push(rule)
                    }
                }
            }
            return rules_apply
        },
        compute_multi_buy: function (promotion) { // TODO: 9_multi_buy
            var rules_apply = this._get_rules_apply_multi_buy(promotion);
            var total_qty_by_product = this.product_quantity_by_product_id();
            var total_price_by_product = this.total_price_by_product_id();
            var product_discount = this.pos.db.product_by_id[promotion.product_id[0]];
            if (rules_apply && product_discount) {
                for (var n = 0; n < rules_apply.length; n++) {
                    var rule = rules_apply[n];
                    var product_promotion = {};
                    var qty_remain = rule['qty_apply'];
                    for (var index in rule.product_ids) {
                        var product_id = rule.product_ids[index];
                        if (total_qty_by_product[product_id]) {
                            var qty_of_product_in_cart = total_qty_by_product[product_id];
                            if (qty_remain >= qty_of_product_in_cart) {
                                product_promotion[product_id] = qty_of_product_in_cart;
                                qty_remain -= qty_of_product_in_cart
                            } else if (qty_remain < qty_of_product_in_cart) {
                                if (qty_remain == 0) {
                                    break
                                }
                                if ((qty_remain - qty_of_product_in_cart) <= 0) {
                                    product_promotion[product_id] = qty_remain;
                                    break
                                } else {
                                    product_promotion[product_id] = qty_of_product_in_cart;
                                }
                            }
                        }
                    }
                }
                var promotion_amount = 0;
                var promotion_reason = 'Buy ';
                for (var product_id in product_promotion) {
                    var product = this.pos.db.get_product_by_id(product_id);
                    promotion_amount += (product.lst_price - rule.list_price) * product_promotion[product_id];
                    promotion_reason += product_promotion[product_id] + ' ' + product.display_name;
                    promotion_reason += ' , '
                }
                promotion_reason += ' Set price each item ' + this.pos.format_currency(rule.list_price);
                this.add_promotion_gift(product_discount, promotion_amount, -1, {
                    promotion: true,
                    promotion_reason: promotion_reason
                })
            }
        },
        compute_buy_x_get_another_free: function (promotion) { // TODO: 10_buy_x_get_another_free
            var minimum_items = promotion['minimum_items'];
            var total_quantity = this.product_quantity_by_product_id();
            for (var index_id in promotion.product_ids) {
                var product_id = promotion.product_ids[index_id];
                if (total_quantity[product_id] && total_quantity[product_id] >= minimum_items) {
                    var qty_free = round_pr((total_quantity[product_id] / minimum_items), 0);
                    var product = this.pos.db.product_by_id[product_id];
                    if (!product) {
                        return this.pos.chrome.showPopup('ConfirmPopup', {
                            title: _t('Error'),
                            body: 'Product id ' + product_id + ' not available in pos'
                        })
                    }
                    this.add_promotion_gift(product, 0, -qty_free, {
                        promotion: true,
                        promotion_reason: promotion.name
                    })
                }
            }
        },
        compute_first_order: function (promotion) { // TODO: 11_first_order
            var total_order = this.get_amount_total_without_promotion();
            if (total_order > 0 && promotion['discount_first_order']) {
                var promotion_reason = promotion.name;
                var lines = _.filter(this.orderlines.models, function (line) {
                    return !line['is_return'] && !line['promotion']
                });
                this._apply_promotion_to_orderlines(lines, promotion.id, promotion_reason, 0, promotion.discount_first_order)
            }
        },
        compute_buy_total_items_free_items: function (promotion) { // TODO: 12_buy_total_items_free_items
            var gifts = this.pos.promotion_gift_free_by_promotion_id[promotion.id];
            if (!gifts) {
                console.warn('gifts not found');
                return false;
            }
            var total_items_ofRules_inCart = 0;
            var product_quantity_by_product_id = this.product_quantity_by_product_id();
            for (var i = 0; i < promotion.product_ids.length; i++) {
                var product_id = promotion.product_ids[i];
                var total_qty_by_product = product_quantity_by_product_id[product_id];
                if (total_qty_by_product) {
                    total_items_ofRules_inCart += total_qty_by_product
                }
            }
            var minimum_items = promotion.minimum_items;
            for (var i = 0; i < gifts.length; i++) {
                var gift = gifts[i];
                var product = this.pos.db.get_product_by_id(gift.product_id[0]);
                var qty_free = gift.quantity_free;
                if (!product) {
                    this.pos.chrome.showPopup('ConfirmPopup', {
                        title: _t('Warning'),
                        body: gift.product_id[1] + _t(' not available in POS, please contact your admin')
                    })
                } else {
                    if (gift.type == 'only_one') {
                        qty_free = qty_free
                    } else {
                        qty_free = parseInt(this.get_total_items() / minimum_items) * qty_free
                    }
                    var product = this.pos.db.get_product_by_id(gift.product_id[0]);
                    if (product) {
                        this.add_promotion_gift(product, 0, qty_free, {
                            promotion: true,
                            promotion_gift: true,
                            promotion_reason: promotion.name
                        })
                    } else {
                        this.pos.chrome.showPopup('ConfirmPopup', {
                            title: _t('Alert'),
                            body: _t('Product' + gift.product_id[1] + ' not found on YOUR POS')
                        })
                    }
                }
            }
        },
        compute_gifts_filter_by_total_amount: function (promotion) { // TODO: 12_buy_total_items_free_items
            var gifts = this.pos.promotion_gift_free_by_promotion_id[promotion.id];
            if (!gifts) {
                console.warn('gifts not found');
                return false;
            }
            var total_order = this.get_amount_total_without_promotion();
            for (var i = 0; i < gifts.length; i++) {
                var gift = gifts[i];
                var qty_free = gift.quantity_free;
                if (gift.type != 'only_one') {
                    if (promotion.amount_total == 0) {
                        promotion.amount_total = 1
                    }
                    qty_free = parseInt(total_order / promotion.amount_total * qty_free)
                }
                var product = this.pos.db.get_product_by_id(gift.product_id[0]);
                if (product) {
                    this.add_promotion_gift(product, 0, qty_free, {
                        promotion: true,
                        promotion_gift: true,
                        promotion_reason: promotion.name
                    })
                } else {
                    this.pos.chrome.showPopup('ConfirmPopup', {
                        title: _t('Alert'),
                        body: _t('Product' + gift.product_id[1] + ' not found in POS')
                    })
                }
            }
        },
        _apply_promotion_to_orderlines: function (lines, promotion_id, promotion_reason, promotion_amount, promotion_discount) {
            for (var n = 0; n < lines.length; n++) {
                var line = lines[n];
                line.promotion = true;
                line.promotion_id = promotion_id;
                line.promotion_reason = promotion_reason;
                if (promotion_amount > 0) {
                    line.promotion_amount = promotion_amount;
                }
                if (promotion_discount > 0) {
                    line.promotion_discount = promotion_discount;
                }
                line.trigger('change', line)
            }
            this.pos.trigger('auto_update:paymentlines');
        },
        add_promotion_gift: function (product, price, quantity, options) {
            var line = new models.Orderline({}, {pos: this.pos, order: this.pos.get_order(), product: product});
            line.promotion = true;
            line.promotion_gift = true;
            if (options.buyer_promotion) {
                line.promotion = options.buyer_promotion;
            }
            if (options.frequent_buyer_id) {
                line.frequent_buyer_id = options.frequent_buyer_id;
            }
            if (options.promotion_reason) {
                line.promotion_reason = options.promotion_reason;
            }
            if (options.promotion_price_by_quantity) {
                line.promotion_price_by_quantity = options.promotion_price_by_quantity;
            }
            line.price_manually_set = true; //no need pricelist change, price of promotion change the same, i blocked
            line.set_quantity(quantity);
            line.set_unit_price(price);
            line.price_manually_set = true;
            this.orderlines.add(line);
            this.pos.trigger('auto_update:paymentlines');
        },
        _checking_period_times_condition: function (promotion) {
            var days = {
                1: 'monday',
                2: 'tuesday',
                3: 'wednesday',
                4: 'thursday',
                5: 'friday',
                6: 'saturday',
                7: 'sunday',
            };
            var pass_condition = false;
            if (!promotion.special_days && !promotion.special_times) {
                pass_condition = true
            } else {
                var date_now = new Date();
                var day_now = date_now.getDay();
                if (promotion.special_days) {
                    if (promotion[days[day_now]] == true) {
                        pass_condition = true
                    } else {
                        return pass_condition
                    }
                }
                if (promotion.special_times) {
                    var limit_from_time = promotion.from_time;
                    var limit_to_time = promotion.to_time;
                    var current_time = date_now.getHours() + date_now.getMinutes() / 600;
                    if (current_time >= limit_from_time && current_time <= limit_to_time) {
                        pass_condition = true
                    } else {
                        pass_condition = false
                    }
                }
            }
            return pass_condition;
        }
    });

    var _super_Orderline = models.Orderline.prototype;
    models.Orderline = models.Orderline.extend({
        initialize: function (attributes, options) {
            var res = _super_Orderline.initialize.apply(this, arguments);
            if (!options.json) {
                // TODO: if sync between session active auto set seller is user assigned
                if (this.pos.config.sync_multi_session && this.pos.config.user_id) {
                    var seller = this.pos.user_by_id[this.pos.config.user_id[0]];
                    if (seller) {
                        this.set_sale_person(seller)
                    }
                }
                // TODO: if default seller auto set user_id for pos_order_line
                if (this.pos.default_seller) {
                    this.set_sale_person(this.pos.default_seller)
                }
                this.selected_combo_items = {};
                this.plus_point = 0;
                this.redeem_point = 0;
                this.reward_id = null;
                this.order_time = new Date().toLocaleTimeString()

            }
            return res;
        },
        init_from_JSON: function (json) {
            _super_Orderline.init_from_JSON.apply(this, arguments);
            if (json.promotion) {
                this.promotion = json.promotion;
            }
            if (json.promotion_gift) {
                this.promotion_gift = json.promotion_gift;
            }
            if (json.promotion_id) {
                this.promotion_id = json.promotion_id;
            }
            if (json.promotion_discount) {
                this.promotion_discount = json.promotion_discount;
            }
            if (json.promotion_amount) {
                this.promotion_amount = json.promotion_amount;
            }
            if (json.promotion_reason) {
                this.promotion_reason = json.promotion_reason;
            }
            if (json.plus_point) {
                this.plus_point = json.plus_point;
            }
            if (json.redeem_point) {
                this.redeem_point = json.redeem_point;
            }
            if (json.reward_id) {
                this.reward_id = json.reward_id;
            }
            if (json.price_extra) {
                this.price_extra = json.price_extra;
            }
            if (json.discount_extra) {
                this.discount_extra = json.discount_extra
            }
            if (json.user_id) {
                var seller = this.pos.user_by_id[json.user_id];
                if (seller) {
                    this.set_sale_person(seller)
                }
            }
            if (json.tag_ids && json.tag_ids.length) {
                var tag_ids = json.tag_ids[0][2];
                if (tag_ids) {
                    this.set_tags(tag_ids)
                }
            }
            if (json.is_return) {
                this.is_return = json.is_return;
            }
            if (json.combo_item_ids && json.combo_item_ids.length) {
                this.set_combo_bundle_pack(json.combo_item_ids);
            }
            if (json.variant_ids && json.variant_ids.length) {
                var variant_ids = json.variant_ids[0][2];
                if (variant_ids) {
                    this.set_variants(variant_ids)
                }
            }
            if (json.uom_id) {
                this.uom_id = json.uom_id;
                var unit = this.pos.units_by_id[json.uom_id];
                if (unit) {
                    this.product.uom_id = [unit['id'], unit['name']];
                }
            }
            if (json.note) {
                this.note = json.note;
            }
            if (json.discount_reason) {
                this.discount_reason = json.discount_reason
            }
            if (json.frequent_buyer_id) {
                this.frequent_buyer_id = json.frequent_buyer_id;
            }
            if (json.packaging_id && this.pos.packaging_by_id && this.pos.packaging_by_id[json.packaging_id]) {
                this.packaging = this.pos.packaging_by_id[json.packaging_id];
            }
            if (json.lot_ids) {
                this.lot_ids = json.lot_ids;
            }
            if (json.manager_user_id && this.pos.user_by_id && this.pos.user_by_id[json.manager_user_id]) {
                this.manager_user = this.pos.user_by_id[json.manager_user_id]
            }
            if (json.base_price) {
                this.set_unit_price(json.base_price);
                this.base_price = null;
            }
            if (json.selected_combo_items) {
                this.set_dynamic_combo_items(json.selected_combo_items)
            }
            if (json.returned_order_line_id) {
                this.returned_order_line_id = json.returned_order_line_id
            }
            if (json.generic_option_ids && json.generic_option_ids.length) {
                var generic_option_ids = json.generic_option_ids[0][2];
                if (generic_option_ids) {
                    this.set_generic_options(generic_option_ids)
                }
            }
            if (json.bom_lines) {
                this.set_bom_lines(json.bom_lines)
            }
            if (json.mrp_production_id) {
                this.mrp_production_id = json.mrp_production_id
            }
            if (json.mrp_production_name) {
                this.mrp_production_name = json.mrp_production_name
            }
            if (json.mrp_production_state) {
                this.mrp_production_state = json.mrp_production_state
            }
            if (json.is_shipping_cost) {
                this.is_shipping_cost = json.is_shipping_cost
            }
            if (json.order_time) {
                this.order_time = json.order_time
            }
        },
        export_as_JSON: function () {
            var json = _super_Orderline.export_as_JSON.apply(this, arguments);
            if (this.promotion) {
                json.promotion = this.promotion;
            }
            if (this.promotion_gift) {
                json.promotion_gift = this.promotion_gift;
            }
            if (this.promotion_id) {
                json.promotion_id = this.promotion_id;
            }
            if (this.promotion_reason) {
                json.promotion_reason = this.promotion_reason;
            }
            if (this.promotion_discount) {
                json.promotion_discount = this.promotion_discount;
            }
            if (this.promotion_amount) {
                json.promotion_amount = this.promotion_amount;
            }
            if (this.plus_point) {
                json.plus_point = this.plus_point;
            }
            if (this.redeem_point) {
                json.redeem_point = this.redeem_point;
            }
            if (this.reward_id) {
                json.reward_id = json.reward_id;
            }
            if (this.price_extra) {
                json.price_extra = this.price_extra;
            }
            if (this.discount_extra) {
                json.discount_extra = this.discount_extra;
            }
            if (this.seller) {
                json.user_id = this.seller.id;
            }
            if (this.base_price) {
                json.base_price = this.base_price;
            }
            if (this.tags && this.tags.length) {
                json.tag_ids = [[6, false, _.map(this.tags, function (tag) {
                    return tag.id;
                })]];
            }
            if (this.get_line_note()) {
                json.note = this.get_line_note();
            }
            if (this.is_return) {
                json.is_return = this.is_return;
            }
            if (this.combo_items && this.combo_items.length) {
                json.combo_item_ids = [];
                for (var n = 0; n < this.combo_items.length; n++) {
                    json.combo_item_ids.push({
                        id: this.combo_items[n].id,
                        quantity: this.combo_items[n].quantity
                    })
                }
            }
            if (this.uom_id) {
                json.uom_id = this.uom_id
            }
            if (this.variants && this.variants.length) {
                json.variant_ids = [[6, false, _.map(this.variants, function (variant) {
                    return variant.id;
                })]];
            }
            if (this.discount_reason) {
                json.discount_reason = this.discount_reason
            }
            if (this.frequent_buyer_id) {
                json.frequent_buyer_id = this.frequent_buyer_id
            }
            if (this.packaging) {
                json.packaging_id = this.packaging.id
            }
            if (this.lot_ids) {
                var pack_lot_ids = json.pack_lot_ids;
                for (var i = 0; i < this.lot_ids.length; i++) {
                    var lot = this.lot_ids[i];
                    pack_lot_ids.push([0, 0, {
                        lot_name: lot['name'],
                        quantity: lot['quantity'],
                        lot_id: lot['id']
                    }]);
                }
                json.pack_lot_ids = pack_lot_ids;
            }
            if (this.manager_user) {
                json.manager_user_id = this.manager_user.id
            }
            if (this.selected_combo_items) {
                json.selected_combo_items = this.selected_combo_items;
            }
            if (this.returned_order_line_id) {
                json.returned_order_line_id = this.returned_order_line_id;
            }
            if (this.generic_options && this.generic_options.length) {
                json.generic_option_ids = [[6, false, _.map(this.generic_options, function (generic) {
                    return generic.id;
                })]];
            }
            if (this.bom_lines) {
                json.bom_lines = this.bom_lines
            }
            if (this.mrp_production_id) {
                json.mrp_production_id = this.mrp_production_id
            }
            if (this.mrp_production_state) {
                json.mrp_production_state = this.mrp_production_state
            }
            if (this.mrp_production_name) {
                json.mrp_production_name = this.mrp_production_name
            }
            if (this.is_shipping_cost) {
                json.is_shipping_cost = this.is_shipping_cost
            }
            if (this.order_time) {
                json.order_time = this.order_time
            }
            return json;
        },
        clone: function () {
            var orderline = _super_Orderline.clone.call(this);
            orderline.note = this.note;
            orderline.discount_reason = this.discount_reason;
            orderline.uom_id = this.uom_id;
            if (this.combo_item_ids && this.combo_item_ids.length) {
                orderline.set_combo_bundle_pack(this.combo_item_ids);
            }
            if (this.variant_ids && this.variant_ids.length) {
                var variant_ids = this.variant_ids[0][2];
                if (variant_ids) {
                    orderline.set_variants(variant_ids)
                }
            }
            orderline.mp_dirty = this.mp_dirty;
            orderline.mp_skip = this.mp_skip;
            orderline.discountStr = this.discountStr;
            orderline.price_extra = this.price_extra;
            orderline.discount_extra = this.discount_extra;
            orderline.discount_reason = this.discount_reason;
            orderline.plus_point = this.plus_point;
            orderline.redeem_point = this.redeem_point;
            orderline.user_id = this.user_id;
            return orderline;
        },
        export_for_printing: function () {
            var receipt_line = _super_Orderline.export_for_printing.apply(this, arguments);
            receipt_line['promotion'] = null;
            receipt_line['promotion_reason'] = null;
            if (this.promotion) {
                receipt_line.promotion = this.promotion;
                receipt_line.promotion_reason = this.promotion_reason;
            }
            receipt_line['combo_items'] = [];
            receipt_line['variants'] = [];
            receipt_line['tags'] = [];
            receipt_line['note'] = this.note || '';
            receipt_line['combo_items'] = [];
            if (this.combo_items) {
                receipt_line['combo_items'] = this.combo_items;
            }
            if (this.variants) {
                receipt_line['variants'] = this.variants;
            }
            if (this.tags) {
                receipt_line['tags'] = this.tags;
            }
            if (this.discount_reason) {
                receipt_line['discount_reason'] = this.discount_reason;
            }
            receipt_line['tax_amount'] = this.get_tax() || 0.00;
            if (this.variants) {
                receipt_line['variants'] = this.variants;
            }
            if (this.packaging) {
                receipt_line['packaging'] = this.packaging;
            }
            if (this.product.name_second) {
                receipt_line['name_second'] = this.product.name_second
            }
            if (this.selected_combo_items) {
                receipt_line['selected_combo_items'] = this.selected_combo_items;
            }
            if (this.generic_options) {
                receipt_line['generic_options'] = this.generic_options;
            }
            if (this.bom_lines) {
                receipt_line['bom_lines'] = this.get_bom_lines()
            }
            if (this.mrp_production_id) {
                receipt_line['mrp_production_id'] = this.mrp_production_id;
            }
            if (this.mrp_production_state) {
                receipt_line['mrp_production_state'] = this.mrp_production_state;
            }
            if (this.mrp_production_name) {
                receipt_line['mrp_production_name'] = this.mrp_production_name;
            }
            return receipt_line;
        },
        getPackLotLinesToEdit: function (isAllowOnlyOneLot) {
            let lotAdded = _super_Orderline.getPackLotLinesToEdit.apply(this, arguments);
            return lotAdded
        },
        _get_plus_point: function () {
            if (!this.pos.loyalty) {
                return 0
            }
            if (this.pos.loyalty.rounding_down) {
                return parseInt(this.plus_point)
            } else {
                return round_pr(this.plus_point, this.pos.loyalty.rounding)
            }
        },
        set_price_extra: function (price_extra) {
            _super_Orderline.set_price_extra.apply(this, arguments);
        },
        set_unit_price: function (price) {
            _super_Orderline.set_unit_price.apply(this, arguments);
        },
        display_discount_policy: function () {
            if (this.order.pricelist) {
                return _super_Orderline.display_discount_policy.apply(this, arguments);
            } else {
                return null
            }
        },
        get_margin: function () {
            if (this.product.standard_price <= 0) {
                return 100
            } else {
                return (this.price - this.product.standard_price) / this.product.standard_price * 100
            }
        },
        set_multi_lot: function (lot_ids) {
            var lot_selected = [];
            for (var i = 0; i < lot_ids.length; i++) {
                var lot = lot_ids[i];
                var lot_record = this.pos.lot_by_id[lot['id']];
                if (lot_record && lot['quantity'] && lot['quantity'] > 0) {
                    lot['name'] = lot_record['name'];
                    lot_selected.push(lot)
                } else {
                    return this.pos.chrome.showPopup('ConfirmPopup', {
                        title: _t('Warning'),
                        body: _t('Lot ' + lot_record.id + ' does not exist. Backend system have removed it, it not possible made return with Lots')
                    })
                }
            }
            this.lot_ids = lot_selected;
            this.trigger('change', this);
            this.trigger('trigger_update_line');
        },
        set_line_note: function (note) {
            this.note = note;
            this.trigger('change', this);
        },
        // TODO: this is combo bundle pack
        set_combo_bundle_pack: function (combo_item_ids) {
            // TODO: combo_item_ids is dict value have id is id of combo item, and quantity if quantity of combo item
            var price_extra = 0;
            this.combo_items = [];
            for (var n = 0; n < combo_item_ids.length; n++) {
                var combo_item_id = combo_item_ids[n].id;
                var quantity = combo_item_ids[n].quantity;
                var combo_item = this.pos.combo_item_by_id[combo_item_id];
                if (combo_item) {
                    this.combo_items.push({
                        id: combo_item['id'],
                        quantity: quantity,
                        price_extra: combo_item.price_extra,
                        product_id: combo_item.product_id,
                    });
                    price_extra += combo_item.price_extra * quantity;
                }
            }
            if (price_extra) {
                this.price_extra = price_extra;
            }
            this.trigger('change', this);
        },
        set_tags: function (tag_ids) {
            this.tags = [];
            for (var index in tag_ids) {
                var tag_id = tag_ids[index];
                var tag = this.pos.tag_by_id[tag_id];
                if (tag) {
                    this.tags.push(tag)
                }
            }
            if (this.tags.length) {
                this.trigger('change', this);
            }
        },
        get_price_included_tax_by_price_of_item: function (price_unit, quantity) {
            var taxtotal = 0;
            var product = this.get_product();
            var taxes_ids = product.taxes_id;
            var taxes = this.pos.taxes;
            var taxdetail = {};
            var product_taxes = [];

            _(taxes_ids).each(function (el) {
                product_taxes.push(_.detect(taxes, function (t) {
                    return t.id === el;
                }));
            });

            var all_taxes = this.compute_all(product_taxes, price_unit, quantity, this.pos.currency.rounding);
            _(all_taxes.taxes).each(function (tax) {
                taxtotal += tax.amount;
                taxdetail[tax.id] = tax.amount;
            });

            return {
                "priceWithTax": all_taxes.total_included,
                "priceWithoutTax": all_taxes.total_excluded,
                "tax": taxtotal,
                "taxDetails": taxdetail,
            };
        },
        set_unit_price_with_currency: function (price, currency) {
            if (currency.id != this.pos.currency.id) {
                if (!this.base_price) {
                    this.base_price = this.price;
                    this.price = price * 1 / currency.rate;
                } else {
                    this.price = this.base_price * 1 / currency.rate;
                }
            } else {
                if (this.base_price) {
                    this.price = this.base_price;
                }
            }
            this.currency = currency;
            this.trigger('change', this);

        },
        has_dynamic_combo_active: function () {
            var pos_categories_combo = _.filter(this.pos.pos_categories, function (categ) {
                return categ.is_category_combo
            });
            if (pos_categories_combo.length > 0) {
                return true
            } else {
                return false
            }
        },
        has_bundle_pack: function () {
            if (this.combo_items && this.combo_items.length) {
                return true
            } else {
                return false
            }
        },
        has_valid_product_lot: function () { //  TODO: is line multi lots or not
            if (this.lot_ids && this.lot_ids.length) {
                return true
            } else {
                return _super_Orderline.has_valid_product_lot.apply(this, arguments);
            }
        },
        has_input_return_reason: function () {
            if (this.tags && this.tags.length) {
                var reason = _.find(this.tags, function (reason) {
                    return reason.is_return_reason;
                });
                if (reason) {
                    return true
                } else {
                    return false
                }
            } else {
                return false
            }
        },
        has_multi_unit: function () {
            var product = this.product;
            var product_tmpl_id;
            if (product.product_tmpl_id instanceof Array) {
                product_tmpl_id = product.product_tmpl_id[0]
            } else {
                product_tmpl_id = product.product_tmpl_id;
            }
            var uom_items = this.pos.uoms_prices_by_product_tmpl_id[product_tmpl_id];
            if (!uom_items) {
                return false;
            }
            var base_uom_id = product['base_uom_id'];
            if (base_uom_id) {
                var base_uom = this.pos.uom_by_id[base_uom_id[0]];
                base_uom['price'] = product.lst_price;
                base_uom['uom_id'] = [base_uom['id'], base_uom['name']];
                uom_items = uom_items.concat(base_uom)
            }
            if (uom_items.length > 0) {
                return true
            }
        },
        set_generic_options: function (generic_option_ids) {
            if (!this.pos.generic_options) {
                return;
            }
            if (generic_option_ids.length) {
                this.generic_options = [];
                this.price_extra = 0
                for (var i = 0; i < generic_option_ids.length; i++) {
                    var generic = this.pos.generic_option_by_id[generic_option_ids[i]];
                    if (generic) {
                        this.generic_options.push(generic)
                        if (generic.price_extra >= 0) {
                            this.price_extra += generic.price_extra
                        }
                    }
                }
                this.generic_option_ids = generic_option_ids;
                this.trigger('change', this)
            } else {
                this.generic_option_ids = []
            }
        },
        set_taxes: function (tax_ids) { // TODO: add taxes to order line
            if (this.product) {
                this.product.taxes_id = tax_ids;
                this.trigger('change', this);
            }
        },
        get_unit_price: function () {
            var unit_price = _super_Orderline.get_unit_price.apply(this, arguments);
            if (this.price_extra) {
                unit_price += this.price_extra;
            }
            if (this.discount_extra && this.discount_extra > 0 && this.discount_extra <= 100) {
                unit_price = unit_price - (unit_price * this.discount_extra / 100)
            }
            if (this.promotion_id) {
                if (this.promotion_amount > 0) {
                    unit_price = unit_price - this.promotion_amount
                }
                if (this.promotion_discount > 0) {
                    unit_price = unit_price - (unit_price * this.promotion_discount / 100)
                }
            }
            return unit_price;
        },
        set_variants: function (variant_ids) { // TODO: add variants to order line
            var self = this;
            var price_extra = 0;
            this.variants = variant_ids.map((variant_id) => (self.pos.variant_by_id[variant_id]))
            for (var i = 0; i < this.variants.length; i++) {
                var variant = this.variants[i];
                price_extra += variant.price_extra * variant.quantity;
            }
            if (this.price_extra != price_extra) {
                this.price_extra = price_extra;
                this.trigger('change', this);
            }
        },
        get_product_price_quantity_item: function () {
            var product_tmpl_id = this.product.product_tmpl_id;
            if (product_tmpl_id instanceof Array) {
                product_tmpl_id = product_tmpl_id[0]
            }
            var product_price_quantities = this.pos.price_each_qty_by_product_tmpl_id[product_tmpl_id];
            if (product_price_quantities) {
                var product_price_quanty_temp = null;
                for (var i = 0; i < product_price_quantities.length; i++) {
                    var product_price_quantity = product_price_quantities[i];
                    if (this.quantity >= product_price_quantity['quantity']) {
                        if (!product_price_quanty_temp) {
                            product_price_quanty_temp = product_price_quantity;
                        } else {
                            if (product_price_quanty_temp['quantity'] <= product_price_quantity['quantity']) {
                                product_price_quanty_temp = product_price_quantity;
                            }
                        }
                    }
                }
                return product_price_quanty_temp;
            }
            return null
        },
        has_variants: function () {
            if (this.variants && this.variants.length && this.variants.length > 0) {
                return true
            } else {
                return false
            }
        },
        set_product_lot: function (product) {
            if (product) { // first install may be have old orders, this is reason made bug
                return _super_Orderline.set_product_lot.apply(this, arguments);
            } else {
                return null
            }
        },
        // if config product tax id: have difference tax of other company
        // but when load data account.tax, pos default only get data of current company
        // and this function return some item undefined
        get_taxes: function () {
            var taxes = _super_Orderline.export_for_printing.apply(this, arguments);
            var new_taxes = [];
            var taxes_ids = this.get_product().taxes_id;
            var taxes = [];
            for (var i = 0; i < taxes_ids.length; i++) {
                if (this.pos.taxes_by_id[taxes_ids[i]]) {
                    new_taxes.push(this.pos.taxes_by_id[taxes_ids[i]]);
                }
            }
            return new_taxes;
        },
        get_packaging: function () {
            if (!this || !this.product || !this.pos.packaging_by_product_id) {
                return false;
            }
            if (this.pos.packaging_by_product_id[this.product.id]) {
                return true
            } else {
                return false
            }
        },
        get_packaging_added: function () {
            if (this.packaging) {
                return this.packaging;
            } else {
                return false
            }
        },
        set_discount_to_line: function (discount) {
            if (discount != 0) {
                this.discount_reason = discount.reason;
                this.set_discount(discount.amount);
            } else {
                this.discount_reason = null;
                this.set_discount(0);
            }
        },
        set_unit: function (uom_id, price) {
            this.uom_id = uom_id;
            if (price) {
                this.set_unit_price(price);
            }
            this.price_manually_set = true;
            return true;
        },
        get_units_price: function () {
            // TODO: each product we have multi unit (uom_ids), if current pricelist have set price for each unit, We return back all units available and price
            var units = [];
            if (!this.order.pricelist) {
                return units
            }
            var pricelist = this.order.pricelist;
            if (this.product.uom_ids && this.product.uom_ids.length) {
                var date = moment().startOf('day');
                var category_ids = [];
                var category = this.product.categ;
                while (category) {
                    category_ids.push(category.id);
                    category = category.parent;
                }
                for (var i = 0; i < this.product.uom_ids.length; i++) {
                    var uom_id = this.product.uom_ids[i];
                    var uom = this.pos.uom_by_id[uom_id];
                    var uom_has_price_included_pricelist = false;
                    for (var n = 0; n < pricelist.items.length; n++) {
                        var item = pricelist.items[n];
                        if ((!item.product_tmpl_id || item.product_tmpl_id[0] === this.product.product_tmpl_id) &&
                            (!item.product_id || item.product_id[0] === this.product.id) &&
                            (!item.categ_id || _.contains(category_ids, item.categ_id[0])) &&
                            (!item.date_start || moment(item.date_start).isSameOrBefore(date)) &&
                            (!item.date_end || moment(item.date_end).isSameOrAfter(date))) {
                            if (item.product_id && item.product_id[0] == this.product.id && item.uom_id && item.uom_id[0] == uom_id) {
                                uom_has_price_included_pricelist = true
                                break;
                            }
                        }
                    }
                    if (uom && uom_has_price_included_pricelist) {
                        var price = this.pos.get_price(this.product, this.order.pricelist, 1, uom_id);
                        units.push({
                            uom: uom,
                            price: price
                        })
                    }
                }
            }
            return units
        },
        // change_unit: function () {
        //     $('.uom-list').replaceWith();
        //     var product = this.product;
        //     var product_tmpl_id;
        //     if (product.product_tmpl_id instanceof Array) {
        //         product_tmpl_id = product.product_tmpl_id[0]
        //     } else {
        //         product_tmpl_id = product.product_tmpl_id;
        //     }
        //     var uom_items = this.pos.uoms_prices_by_product_tmpl_id[product_tmpl_id];
        //     if (!uom_items || !this.pos.config.change_unit_of_measure) {
        //         return;
        //     }
        //     var base_uom_id = product['base_uom_id'];
        //     if (base_uom_id) {
        //         var base_uom = this.pos.uom_by_id[base_uom_id[0]];
        //         base_uom['price'] = product.lst_price;
        //         base_uom['uom_id'] = [base_uom['id'], base_uom['name']];
        //         uom_items = uom_items.concat(base_uom)
        //     }
        //     if (uom_items.length) {
        //         $('.control-buttons-extend').empty();
        //         $('.control-buttons-extend').removeClass('oe_hidden');
        //         var multi_unit_widget = new MultiUnitWidget(this, {
        //             uom_items: uom_items,
        //             selected_line: this
        //         });
        //         multi_unit_widget.appendTo($('.control-buttons-extend'));
        //     }
        // },
        is_package: function () {
            if (!this.pos.packaging_by_product_id) {
                return false
            }
            var packagings = this.pos.packaging_by_product_id[this.product.id];
            if (packagings) {
                return true
            } else {
                return false
            }
        },
        is_cross_selling: function () {
            var self = this;
            var cross_items = _.filter(this.pos.cross_items, function (cross_item) {
                return cross_item['product_tmpl_id'][0] == self.product.product_tmpl_id;
            });
            if (cross_items.length) {
                return true
            } else {
                return false
            }
        },
        change_cross_selling: function () {
            var self = this;
            var cross_items = _.filter(this.pos.cross_items, function (cross_item) {
                return cross_item['product_tmpl_id'][0] == self.product.product_tmpl_id;
            });
            if (cross_items.length) {
                this.pos.chrome.showPopup('popup_cross_selling', {
                    title: _t('Please, Suggest Customer buy more products bellow'),
                    widget: this,
                    cross_items: cross_items
                });
            } else {
                this.pos.chrome.showPopup('ErrorPopup', {
                    title: _t('Warning'),
                    body: 'You not active cross selling or product have not items cross selling'
                });
            }
        },
        get_number_of_order: function () {
            var uid = this.uid;
            var order = this.order;
            for (var i = 0; i < order.orderlines.models.length; i++) {
                var line = order.orderlines.models[i];
                if (line.uid == uid) {
                    return i + 1
                }
            }
        },
        get_sale_person: function () {
            return this.seller;
        },
        set_sale_person: function (seller) {
            var order = this.order;
            if (this.pos.config.force_seller) {
                _.each(order.orderlines.models, function (line) {
                    line.seller = seller;
                    line.trigger('change', line);
                });
                order.seller = seller;
            } else {
                this.seller = seller;
            }
            this.trigger('change', this);
        },
        get_price_without_quantity: function () {
            if (this.quantity != 0) {
                return this.get_price_with_tax() / this.quantity
            } else {
                return 0
            }
        },
        get_line_image: function () { // show image on receipt and orderlines
            return window.location.origin + '/web/image?model=product.product&field=image_128&id=' + this.product.id;
        },
        is_has_tags: function () {
            if (!this.tags || this.tags.length == 0) {
                return false
            } else {
                return true
            }
        },
        is_multi_variant: function () {
            var variants = this.pos.variant_by_product_tmpl_id[this.product.product_tmpl_id];
            if (!variants) {
                return false
            }
            if (variants.length > 0) {
                return true;
            } else {
                return false;
            }
        },
        // TODO: method return disc value each line
        get_price_discount: function () {
            var price = this.get_unit_price() * (1.0 - (this.get_discount() / 100.0));
            var base_price = this.get_unit_price();
            return (base_price - price) * this.quantity
        },
        get_unit: function () {
            if (!this.uom_id) {
                var unit_id = this.product.uom_id;
                if (!unit_id) {
                    return undefined;
                }
                unit_id = unit_id[0];
                if (!this.pos) {
                    return undefined;
                }
                let unit = this.pos.units_by_id[unit_id];
                return unit;
            } else {
                var unit_id = this.uom_id;
                var unit = this.pos.units_by_id[unit_id];
                return unit;
            }
        },
        get_stock_onhand: function () {
            if (this.product.type == 'product' && this.pos.db.stock_datas) {
                return this.pos.db.stock_datas[this.product.id];
            } else {
                return null
            }
        },
        is_multi_unit_of_measure: function () {
            var uom_items = this.pos.uoms_prices_by_product_tmpl_id[this.product.product_tmpl_id];
            if (!uom_items) {
                return false;
            }
            if (uom_items.length > 0) {
                return true;
            } else {
                return false;
            }
        },
        modifier_bom: function () {
            var self = this;
            var boms = this.is_has_bom();
            var bom_list = [];
            if (boms && boms.length > 0) {
                for (var i = 0; i < boms.length; i++) {
                    var bom = boms[i];
                    for (var j = 0; j < bom.bom_line_ids.length; j++) {
                        var bom_line = bom.bom_line_ids[j];
                        bom_line.quantity = bom_line.product_qty;
                    }
                    bom_list.push({
                        label: bom.code,
                        item: bom
                    })
                }
            }
            var bom_lines_set = this.get_bom_lines();
            if (bom_lines_set) {
                for (var i = 0; i < boms.length; i++) {
                    var bom = boms[i];
                    for (var j = 0; j < bom.bom_line_ids.length; j++) {
                        var bom_line = bom.bom_line_ids[j];
                        var bom_line_set = _.find(bom_lines_set, function (b) {
                            return b.bom_line.id == bom_line.id
                        })
                        if (bom_line_set) {
                            bom_line.quantity = bom_line_set.quantity
                        }
                    }
                }
            }
            this.add_bom = function (bom) {
                return this.pos.chrome.showPopup('PopUpSelectionMultiQuantity', {
                    title: _t('Modifiers BOM of : ' + self.product.display_name),
                    fields: ['product_id', 'product_qty'],
                    sub_datas: bom['bom_line_ids'],
                    sub_search_string: null,
                    sub_record_by_id: null,
                    multi_choice: true,
                    sub_template: 'BomLines',
                    body: _t('Modifiers BOM of : ' + self.product.display_name),
                    confirm: function (bom_lines) {
                        self.set_bom_lines(bom_lines);
                    },
                    cancel: function () {
                        self.set_bom_lines([]);
                    }
                })
            }

            if (boms.length == 1) {
                return this.add_bom(boms[0])
            }
            return this.pos.chrome.showPopup('selection', {
                title: _t('Alert, Please select one BOM for add to this Selected Line'),
                list: bom_list,
                confirm: function (bom) {
                    return self.add_bom(bom)
                }
            })
        },
        get_bom_lines: function () {
            if (!this.bom_lines) {
                return []
            } else {
                var bom_lines_added = []
                for (var i = 0; i < this.bom_lines.length; i++) {
                    var bom_line_item = this.bom_lines[i];
                    var bom_line = this.pos.bom_line_by_id[bom_line_item.id];
                    bom_lines_added.push({
                        bom_line: bom_line,
                        quantity: bom_line_item.quantity
                    })
                }
                return bom_lines_added
            }
        },
        set_bom_lines: function (bom_lines) {
            this.bom_lines = bom_lines;
            var price_extra = 0;
            for (var i = 0; i < bom_lines.length; i++) {
                var bom_line_set = bom_lines[i];
                var bom_line_record = this.pos.bom_line_by_id[bom_line_set.id]
                if (bom_line_record.price_extra >= 0) {
                    price_extra += bom_line_record.price_extra
                }
            }
            if (price_extra) {
                this.price_extra = price_extra;
            }
            this.trigger('change', this)
        },
        is_has_bom: function () {
            if (this.pos.bom_by_product_id && this.pos.bom_by_product_id[this.product.id]) {
                return this.pos.bom_by_product_id[this.product.id]
            }
            return false
        },
        // TODO: this is dynamic combo ( selected_combo_items is {product_id: quantity} )
        set_dynamic_combo_items: function (selected_combo_items) {
            var price_extra = 0;
            for (var product_id in selected_combo_items) {
                var product = this.pos.db.product_by_id[parseInt(product_id)];
                price_extra += product['combo_price'] * selected_combo_items[product_id];
            }
            this.selected_combo_items = selected_combo_items;
            if (price_extra) {
                this.price_extra = price_extra;
            }
            this.trigger('change', this);
        },
        is_combo: function () {
            for (var product_id in this.selected_combo_items) {
                return true
            }
            return false
        },
        has_combo_item_tracking_lot: function () {
            var tracking = false;
            for (var i = 0; i < this.pos.combo_items.length; i++) {
                var combo_item = this.pos.combo_items[i];
                if (combo_item['tracking']) {
                    tracking = true;
                }
            }
            return tracking;
        },
        _validate_stock_on_hand: function (quantity) {
            var line_quantity = quantity;
            var product = this.product;
            var stock_datas = this.pos.db.stock_datas;
            if (product['type'] == 'product' && stock_datas && stock_datas[product.id] != undefined) {
                if (!quantity) {
                    line_quantity = this.quantity;
                }
                var stock_available = stock_datas[product.id];
                if (line_quantity > stock_available) {
                    return _t(product.name + ' available on stock is ' + stock_available + ' . Not allow sale bigger than this quantity')
                }
            }
            return true
        },
        set_quantity: function (quantity, keep_price) {
            var self = this;
            var update_combo_items = false;
            if (this.uom_id || this.redeem_point) {
                keep_price = 'keep price because changed uom id or have redeem point'
            }
            if (this.pos.the_first_load == false && quantity != 'remove' && !this.pos.config['allow_order_out_of_stock'] && quantity && quantity != 'remove' && this.order.syncing != true && this.product['type'] != 'service') {
                var current_qty = 0;
                for (var i = 0; i < this.order.orderlines.models.length; i++) {
                    var line = this.order.orderlines.models[i];
                    if (this.product.id == line.product.id && line.id != this.id) {
                        current_qty += line.quantity
                    }
                }
                current_qty += parseFloat(quantity);
                if (this.pos.db.stock_datas[this.product.id] && current_qty > this.pos.db.stock_datas[this.product.id] && this.product['type'] == 'product') {
                    var product = this.pos.db.get_product_by_id(this.product.id);
                    this.pos.chrome.showPopup('ErrorPopup', {  // TODO: only show dialog warning, when do payment will block
                        title: _t('Warning'),
                        body: product['name'] + _t('out of Stock, Current stock is: ') + this.pos.db.stock_datas[this.product.id],
                    });
                }
            }
            var qty_will_set = parseFloat(quantity);
            if (qty_will_set <= 0) {
                this.selected_combo_items = {}
                update_combo_items = true
            } else {
                for (var product_id in this.selected_combo_items) {
                    var qty_of_combo_item = this.selected_combo_items[product_id]
                    var new_qty = qty_will_set / this.quantity * qty_of_combo_item;
                    this.selected_combo_items[product_id] = new_qty
                    update_combo_items = true;
                }
            }
            var res = _super_Orderline.set_quantity.call(this, quantity, keep_price); // call style change parent parameter : keep_price
            if (!this.promotion && quantity == 'remove' || quantity == '') {
                this.order.remove_all_promotion_line();
            }
            if (update_combo_items) {
                this.set_dynamic_combo_items(this.selected_combo_items)
            }
            if (this.combo_items && this.pos.config.screen_type != 'kitchen') { // if kitchen screen, no need reset combo items
                this.trigger('change', this);
            }
            var get_product_price_quantity = this.get_product_price_quantity_item(); // product price filter by quantity of cart line. Example: buy 1 unit price 1, buy 10 price is 0.5
            if (get_product_price_quantity) {
                setTimeout(function () {
                    self.syncing = true;
                    self.set_unit_price(get_product_price_quantity['price_unit']);
                    self.syncing = false;
                }, 500)
            }
            var order = this.order;
            var orderlines = order.orderlines.models;
            if (!order.fiscal_position || orderlines.length != 0) {
                for (var i = 0; i < orderlines.length; i++) { // reset taxes_id of line
                    orderlines[i]['taxes_id'] = [];
                }
            }
            if (order.fiscal_position && orderlines.length) {
                var fiscal_position = order.fiscal_position;
                var fiscal_position_taxes_by_id = fiscal_position.fiscal_position_taxes_by_id
                if (fiscal_position_taxes_by_id) {
                    for (var number in fiscal_position_taxes_by_id) {
                        var fiscal_tax = fiscal_position_taxes_by_id[number];
                        var tax_src_id = fiscal_tax.tax_src_id;
                        var tax_dest_id = fiscal_tax.tax_dest_id;
                        if (tax_src_id && tax_dest_id) {
                            for (var i = 0; i < orderlines.length; i++) { // reset taxes_id of line
                                orderlines[i]['taxes_id'] = [];
                            }
                            for (var i = 0; i < orderlines.length; i++) { // append taxes_id of line
                                var line = orderlines[i];
                                var product = line.product;
                                var taxes_id = product.taxes_id;
                                for (var number in taxes_id) {
                                    var tax_id = taxes_id[number];
                                    if (tax_id == tax_src_id[0]) {
                                        orderlines[i]['taxes_id'].push(tax_dest_id[0]);
                                    }
                                }
                            }
                        }
                    }
                } else {
                    for (var i = 0; i < orderlines.length; i++) { // reset taxes_id of line
                        orderlines[i]['taxes_id'] = [];
                    }
                }
            }
            return res;
        },
        get_line_note: function (note) {
            return this.note;
        },
        set_selected: function (selected) {
            _super_Orderline.set_selected.apply(this, arguments);
        },
        async set_discount(discount) {
            if (!this.pos.the_first_load && this.pos.config.discount_limit && discount > this.pos.config.discount_limit_amount) {
                let validate = await this.pos._validate_action(this.env._t('Need approve this discount'));
                if (!validate) {
                    return this.pos.chrome.showPopup('ErrorPopup', {
                        title: _t('Error'),
                        body: _t('Your discount just set bigger than Discount limit % (POS Setting), and required Manager Approve it')
                    });
                }
            }
            _super_Orderline.set_discount.apply(this, arguments);
        },
        can_be_merged_with: function (orderline) {
            var merge = _super_Orderline.can_be_merged_with.apply(this, arguments);
            if (orderline.promotion || orderline.variants || orderline.is_return || orderline.discount_extra || orderline.price_extra || orderline['note'] || orderline['combo_items'] || orderline.product.is_combo || orderline.is_return) {
                return false;
            }
            return merge
        },
        callback_set_discount: function (discount) {
            this.pos.config.validate_discount_change = false;
            this.set_discount(discount);
            this.pos.config.validate_discount_change = true;
        },
        get_product_generic_options: function () {
            var options = []
            if (this.pos.generic_options) {
                for (var i = 0; i < this.pos.generic_options.length; i++) {
                    var generic = this.pos.generic_options[i];
                    if (generic.product_ids.indexOf(this.product.id) != -1) {
                        options.push(generic)
                    }
                }
            }
            return options
        }
    });
});
