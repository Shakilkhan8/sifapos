/*
    This module create by: thanhchatvn@gmail.com
    License: OPL-1
    Please do not modification if i'm not accepted
 */
odoo.define('pos_retail.model', function (require) {
    var models = require('point_of_sale.models');
    var utils = require('web.utils');
    var core = require('web.core');
    var round_pr = utils.round_precision;
    var _t = core._t;
    var rpc = require('pos.rpc');
    var session = require('web.session');
    var time = require('web.time');
    var Session = require('web.Session');
    var load_model = require('pos_retail.load_models');
    const {Printer} = require('point_of_sale.Printer');

    models.load_models([
        {
            label: 'Your Odoo Server IP/Port and All POS Boxes',
            model: 'pos.iot',
            condition: function (self) {
                if (self.config.posbox_save_orders && self.config.posbox_save_orders_iot_ids.length) {
                    return true
                } else {
                    return false;
                }
            },
            fields: [],
            domain: function (self) {
                return [['id', 'in', self.config.posbox_save_orders_iot_ids]]
            },
            loaded: function (self, iot_boxes) {
                self.iot_boxes_save_orders_by_id = {};
                self.iot_boxes_save_orders = [];
                for (var i = 0; i < iot_boxes.length; i++) {
                    var iot_box = iot_boxes[i];
                    var iot_url = 'http://' + iot_box.proxy + ':' + iot_box.port;
                    self.iot_boxes_save_orders_by_id[iot_box['id']] = iot_box;
                    var iot_connection = new Session(void 0, iot_url, {
                        use_cors: true
                    });
                    self.iot_boxes_save_orders.push(iot_connection);
                }
                self._bind_iot();
            }
        }
    ]);
    var _super_PosModel = models.PosModel.prototype;
    models.PosModel = models.PosModel.extend({
        wrongInput(el, element) {
            $(el).find(element).css({
                'box-shadow': '0px 0px 0px 1px rgb(236, 5, 5) inset',
                'border': 'none !important',
                'border-bottom': '1px solid red !important'
            });
        },
        passedInput(el, element) {
            $(el).find(element).css({
                'box-shadow': '#3F51B5 0px 0px 0px 1px inset'
            })
        },
        _bind_iot: function () { // TODO: get notifications update from another sessions the same bus id
            // TODO: timeout 30 seconds, auto checking status of all pos boxes
            var self = this;
            for (var i = 0; i < this.iot_boxes_save_orders.length; i++) {
                var iot = this.iot_boxes_save_orders[i];
                iot.rpc('/pos/ping/server', {
                    ip: this.config.posbox_save_orders_server_ip,
                    port: this.config.posbox_save_orders_server_port
                }, {shadow: true, timeout: 650000}).then(function (result) {
                    var value = JSON.parse(result);
                    var response_ping_odoo_server = value.values;
                    if (!response_ping_odoo_server) {
                        self.set('synch', {status: 'disconnected', pending: 1});
                        self.chrome.showPopup('dialog', {
                            title: _t('Warning'),
                            body: _t('Odoo server down or network PosBox have problem, IoT could not ping to your Odoo with ip ' + self.config.posbox_save_orders_server_ip + ' and port:' + self.config.posbox_save_orders_server_port)
                        })
                    } else {
                        console.log('Ping Odoo server IP: http://' + self.config.posbox_save_orders_server_ip + ':8069 from IoT succeed')
                    }
                }).catch(function (error) {
                    self.chrome.showPopup('dialog', {
                        title: _t('Warning'),
                        body: _t('Your session could not connect to posbox, ip address of posbox is wrong or your network and posbox network not the same lan network')
                    })
                });
                iot.rpc('/pos/push/orders', {
                    database: this.session.db,
                }, {shadow: true, timeout: 65000}).then(function (result) {
                    console.log('Result of Call IoT Box push orders to Odoo Server: ' + result)
                    self.set('synch', {status: 'connected', pending: 1});
                }).catch(function (error) {
                    self.set('synch', {status: 'disconnected', pending: 1});
                    console.log(error)
                })
            }
            setTimeout(_.bind(this._bind_iot, this), 5000);
        },
        reload_pos: function () {
            location.reload();
        },
        close_pos: function () {
            window.location = '/web#action=point_of_sale.action_client_pos_menu';
        },
        _flush_orders: function (orders, options) {
            // TODO: this is test case push 500 orders / current time
            var self = this;
            if (this.iot_boxes_save_orders) {
                if (orders.length) {
                    console.log('Send direct orders to posbox: ' + orders.length)
                    for (var i = 0; i < this.iot_boxes_save_orders.length; i++) {
                        this.iot_boxes_save_orders[i].rpc("/pos/save/orders", {
                            database: this.session.db,
                            orders: orders,
                            url: 'http://' + this.config.posbox_save_orders_server_ip + ':' + this.config.posbox_save_orders_server_port + '/pos/create_from_ui',
                            username: this.session.username,
                            server_version: this.session.server_version,

                        }, {shadow: true, timeout: 60000}).then(function (results) {
                            var order_ids = JSON.parse(results)['order_ids'];
                            for (var i = 0; i < order_ids.length; i++) {
                                self.db.remove_order(order_ids[i]);
                                self.set('failed', false);
                            }
                            return order_ids

                        }).catch(function (reason) {
                            console.error('Failed to send orders:', orders);
                            self.gui.show_sync_error_popup();
                            throw reason;
                        });
                    }
                }
                return Promise.resolve([]);
            } else {
                return _super_PosModel._flush_orders.apply(this, arguments)
            }
        },
        get_picking_source_location: function () {
            var stock_location_id = this.config.stock_location_id;
            var selected_order = this.get_order();
            if (selected_order && selected_order.location) {
                return selected_order.location;
            } else {
                return this.stock_location_by_id[stock_location_id[0]];
            }
        },
        get_all_source_locations: function () {
            if (this.stock_location_ids.length != 0) {
                return this.stock_location_ids.concat(this.config.stock_location_id[0])
            } else {
                return [this.config.stock_location_id[0]]
            }
        },
        generate_wrapped_name: function (name) {
            var MAX_LENGTH = 24; // 40 * line ratio of .6
            var wrapped = [];
            var current_line = "";

            while (name.length > 0) {
                var space_index = name.indexOf(" ");

                if (space_index === -1) {
                    space_index = name.length;
                }

                if (current_line.length + space_index > MAX_LENGTH) {
                    if (current_line.length) {
                        wrapped.push(current_line);
                    }
                    current_line = "";
                }

                current_line += name.slice(0, space_index + 1);
                name = name.slice(space_index + 1);
            }

            if (current_line.length) {
                wrapped.push(current_line);
            }

            return wrapped;
        },
        update_onhand_by_product: function (product) {
            var self = this;
            this.product_need_update = product;
            var stock_location_ids = this.get_all_source_locations();
            return this._get_stock_on_hand_by_location_ids([product.id], stock_location_ids).then(function (datas) {
                var list = [];
                for (var location_id in datas) {
                    var location = self.stock_location_by_id[location_id];
                    if (location) {
                        list.push({
                            'id': location['id'],
                            'location': location['name'],
                            'qty_available': datas[location_id][self.product_need_update.id]
                        })
                    }
                }
                if (list.length <= 0) {
                    self.chrome.showPopup('dialog', {
                        title: _t('Warning'),
                        body: _t('Product type not Stockable Product')
                    })
                } else {
                    return self.chrome.showPopup('popup_selection_extend', {
                        title: _t('Are you want update Stock on hand of : ') + self.product_need_update.name,
                        body: _t('All Quantity Available of Product: ') + self.product_need_update.name + _t('.If you want add more stock on hand, click to one line'),
                        fields: ['location', 'qty_available'],
                        sub_datas: list,
                        sub_template: 'stocks_list',
                        confirm: function (location_id) {
                            self.location_id = location_id;
                            var location = self.stock_location_by_id[location_id];
                            setTimeout(function () {
                                return self.chrome.showPopup('number', {
                                    'title': _t('Update Product Quantity of ' + self.product_need_update.name + ' to Location ' + location.name),
                                    'value': 0,
                                    'confirm': function (new_quantity) {
                                        var new_quantity = parseFloat(new_quantity);
                                        return rpc.query({
                                            model: 'stock.location',
                                            method: 'pos_update_stock_on_hand_by_location_id',
                                            args: [location.id, {
                                                product_id: self.product_need_update.id,
                                                product_tmpl_id: self.product_need_update.product_tmpl_id,
                                                new_quantity: new_quantity,
                                                location_id: location.id
                                            }],
                                            context: {}
                                        }, {
                                            shadow: true,
                                            timeout: 60000
                                        }).then(function (values) {
                                            self._do_update_quantity_onhand([self.product_need_update.id]);
                                            return self.chrome.showPopup('ConfirmPopup', {
                                                title: values['product'],
                                                body: values['location'] + ' have new on hand: ' + values['quantity'],
                                                color: 'success'
                                            })
                                        }, function (err) {
                                            return self.query_backend_fail(err);
                                        })
                                    }
                                })
                            }, 500)
                        }
                    })
                }
            });
        },
        highlight_control_button: function (button_class) {
            $('.' + button_class).addClass('highlight')
        },
        remove_highlight_control_button: function (button_class) {
            $('.' + button_class).removeClass('highlight')
        },
        show_purchased_histories: function (client) {
            var self = this;
            if (!client) {
                client = this.get_client();
            }
            if (!client) {
                this.chrome.showPopup('dialog', {
                    title: 'Warning',
                    body: 'We could not find purchased orders histories, please set client first'
                });
                this.gui.show_screen('clientlist')
            } else {
                var orders = this.db.get_pos_orders().filter(function (order) {
                    return order.partner_id && order.partner_id[0] == client['id']
                });
                if (orders.length) {
                    return this.chrome.showPopup('popup_selection_extend', {
                        title: _t('Purchased Histories of ') + client.name,
                        fields: ['name', 'ean13', 'date_order', 'pos_reference'],
                        sub_datas: orders,
                        sub_template: 'purchased_orders',
                        body: 'Please select one sale person',
                        confirm: function (order_id) {
                            var order = self.db.order_by_id[order_id];
                            self.gui.show_screen('PosOrderScreen')
                            self.gui.screen_instances['PosOrderScreen'].order_selected = order;
                        }
                    })
                } else {
                    this.chrome.showPopup('ConfirmPopup', {
                        title: 'Warning',
                        body: 'Your POS not active POS Order Management or Current Client have not any Purchased Orders'
                    })
                }
            }
        },
        _get_stock_on_hand_by_location_ids: function (product_ids = [], location_ids = []) {
            console.log('=> _get_stock_on_hand_by_location_ids: ' + product_ids + ' with location ids: ' + location_ids)
            return rpc.query({
                model: 'stock.location',
                method: 'get_stock_data_by_location_ids',
                args: [[], product_ids, location_ids],
                context: {}
            }, {
                shadow: true,
                timeout: 65000
            });
        },
        _get_voucher_number: function () {
            var self = this;
            return new Promise(function (resolve, reject) {
                return rpc.query({
                    model: 'pos.config',
                    method: 'get_voucher_number',
                    args: [[], self.config.id],
                    context: {}
                }).then(function (number) {
                    resolve(number)
                }, function (err) {
                    reject(err)
                })
            })
        },
        show_products_with_field: function (field) {
            var products = this.db.get_product_by_category(0);
            var products_by_field = _.filter(products, function (product) {
                return product[field] == true;
            });
            if (products_by_field.length != 0) {
                this.gui.screen_instances.products.product_list_widget.set_product_list(products_by_field);
            }
        },
        show_products_type_only_product: function () {
            var products = this.db.get_product_by_category(0);
            var products_type_product = _.filter(products, function (product) {
                return product.type == 'product';
            });
            this.gui.screen_instances.products.product_list_widget.set_product_list(products_type_product);
        },
        _do_update_quantity_onhand: function (product_ids) {
            const self = this;
            if (!this.config.display_onhand && !this.config.update_stock_onhand_realtime) {
                return
            }
            var location_selected = this.get_picking_source_location();
            console.log('=> _do_update_quantity_onhand of Location: ' + location_selected.name);
            if (product_ids.length == 0) {
                var products = this.db.get_product_by_category(0);
                var products_type_product = _.filter(products, function (product) {
                    return product.type == 'product';
                });
                if (products_type_product.length) {
                    product_ids = _.pluck(products_type_product, 'id');
                }
            }
            if (product_ids.length == 0) {
                return true
            }
            return this._get_stock_on_hand_by_location_ids(product_ids, [location_selected.id]).then(function (stock_datas) {
                var products = [];
                var datas = stock_datas[self.get_picking_source_location().id];
                if (!datas) {
                    return;
                }
                for (var product_id in datas) {
                    var product = self.db.product_by_id[parseInt(product_id)];
                    if (product) {
                        products.push(product);
                        var qty_available = datas[product_id];
                        try {
                            self.db.stock_datas[product['id']] = qty_available;
                        } catch (ex) {
                            debugger
                        }

                    }
                }
                if (products.length) {
                    self.trigger('orderWidget.updated')
                }
                self.product_ids_need_update_stock = [];
            })
        },
        async _validate_action(title) {
            let validate = await this._validate_by_manager(title);
            if (!validate) {
                this.chrome.showPopup('ErrorPopup', {
                    title: this.env._t('Error'),
                    body: this.env._t(
                        'This action required approve by your manager !'
                    ),
                });
                return false;
            }
            return true
        },
        async _validate_by_manager(title) {
            var self = this;
            var manager_validate = [];
            _.each(this.config.manager_ids, function (user_id) {
                var user = self.user_by_id[user_id];
                if (user) {
                    manager_validate.push({
                        label: user.name,
                        item: user
                    })
                }
            });
            if (manager_validate.length == 0) {
                this.chrome.showPopup('ConfirmPopup', {
                    title: this.env._t('Warning'),
                    body: this.env._t('Your POS Setting / Tab Security not set Managers Approve'),
                })
                return false
            }
            var popup_title = this.env._t('Request one Manager approve this Action');
            if (title) {
                popup_title += ' : ' + title;
            }
            let {confirmed, payload: selected_user} = await this.chrome.showPopup('SelectionPopup', {
                title: popup_title,
                list: manager_validate,
            })
            if (confirmed) {
                let manager_user = selected_user;
                if (!manager_user.pos_security_pin) {
                    this.chrome.showPopup('ConfirmPopup', {
                        title: _t('Warning'),
                        body: manager_user.name + _t(' have not set pos security pin on User Setting')
                    })
                    return false
                } else {
                    let {confirmed, payload: password} = await self.chrome.showPopup('NumberPopup', {
                        title: _t('Hello ') + manager_user.name + this.env._t('. Can you input your POS Pass Pin for validate this Action of ') + this.user.name,
                        isPassword: true,
                    });
                    if (confirmed) {
                        if (manager_user['pos_security_pin'] != password) {
                            this.alert_message({
                                title: _t('Warning'),
                                body: _t('Pos Security Pin of ') + manager_user.name + _t(' Incorrect.')
                            })
                            return self._validate_by_manager(title)
                        } else {
                            return true
                        }
                    } else {
                        this.alert_message({
                            title: _t('Alert'),
                            body: _t('Your Manager cancelled request')
                        })
                    }
                }
            } else {
                return false
            }
        },
        _search_read_by_model_and_id: function (model, ids) {
            var object = this.get_model(model);
            return new Promise(function (resolve, reject) {
                rpc.query({
                    model: model,
                    method: 'search_read',
                    domain: [['id', 'in', ids]],
                    fields: object.fields
                }).then(function (datas) {
                    resolve(datas)
                }, function (error) {
                    reject(error)
                })
            })
        },
        _update_cart_qty_by_order: function (product_ids) {
            var selected_order = this.get_order();
            $('.cart_qty').addClass('oe_hidden');
            var product_quantity_by_product_id = selected_order.product_quantity_by_product_id();
            for (var i = 0; i < selected_order.orderlines.models.length; i++) {
                var line = selected_order.orderlines.models[i];
                var product_id = line.product.id;
                var $qty = $('article[data-product-id="' + product_id + '"] .cart_qty');
                var qty = product_quantity_by_product_id[product_id];
                if (qty) {
                    $qty.removeClass('oe_hidden');
                    $('article[data-product-id="' + product_id + '"] .add_shopping_cart').html(qty);
                } else {
                    $qty.addClass('oe_hidden');
                }
            }
            var total_items = selected_order.get_total_items();
            $('.items-incart').text(total_items);
        },
        _get_active_pricelist: function () {
            var current_order = this.get_order();
            var default_pricelist = this.default_pricelist;
            if (current_order && current_order.pricelist) {
                var pricelist = _.find(this.pricelists, function (pricelist_check) {
                    return pricelist_check['id'] == current_order.pricelist['id']
                });
                return pricelist;
            } else {
                if (default_pricelist) {
                    var pricelist = _.find(this.pricelists, function (pricelist_check) {
                        return pricelist_check['id'] == default_pricelist['id']
                    });
                    return pricelist
                } else {
                    return null
                }
            }
        },
        _get_default_pricelist: function () {
            var current_pricelist = this.default_pricelist;
            return current_pricelist
        },
        get_model: function (_name) {
            var _index = this.models.map(function (e) {
                return e.model;
            }).indexOf(_name);
            if (_index > -1) {
                return this.models[_index];
            }
            return false;
        },
        initialize: function (session, attributes) {
            this.is_mobile = odoo.is_mobile;
            var account_tax_model = this.get_model('account.tax');
            account_tax_model.fields.push('type_tax_use');
            var wait_currency = this.get_model('res.currency');
            wait_currency.fields.push(
                'rate'
            );
            var account_fiscal_position_tax_model = this.get_model('account.fiscal.position.tax');
            var _super_account_fiscal_position_tax_model_loaded = account_fiscal_position_tax_model.loaded;
            account_fiscal_position_tax_model.loaded = function (self, fiscal_position_taxes) {
                fiscal_position_taxes = _.filter(fiscal_position_taxes, function (tax) {
                    return tax.tax_dest_id != false;
                });
                if (fiscal_position_taxes.length > 0) {
                    _super_account_fiscal_position_tax_model_loaded(self, fiscal_position_taxes);
                }
            };
            var pos_category_model = this.get_model('pos.category');
            pos_category_model.condition = function (self) {
                return self.config.product_category_ids.length == 0
            }
            var _super_loaded_pos_category_model = pos_category_model.loaded;
            pos_category_model.loaded = function (self, categories) {
                if (!self.pos_categories) {
                    self.pos_categories = categories;
                    self.pos_category_by_id = {};
                } else {
                    self.pos_categories = self.pos_categories.concat(categories);
                }
                for (var i = 0; i < categories.length; i++) {
                    var category = categories[i];
                    self.pos_category_by_id[category.id] = category;
                }
                _.each(categories, function (category) {
                    category.parent = self.pos_category_by_id[category.parent_id[0]];
                });
                _super_loaded_pos_category_model(self, categories);
            };
            pos_category_model.fields = pos_category_model.fields.concat([
                'is_category_combo',
                'sale_limit_time',
                'from_time',
                'to_time',
                'submit_all_pos',
                'pos_branch_ids',
                'pos_config_ids',
            ]);

            var product_category_model = this.get_model('product.category');
            product_category_model.domain = function (self) {
                if (self.config.product_category_ids) {
                    return [['id', 'in', self.config.product_category_ids]]
                } else {
                    return []
                }
            }
            var _super_loaded_product_category_model = product_category_model.loaded;
            product_category_model.loaded = function (self, categories) {
                if (!self.pos_categories) {
                    self.pos_categories = categories;
                    self.pos_category_by_id = {};
                } else {
                    self.pos_categories = self.pos_categories.concat(categories);
                }
                for (var i = 0; i < categories.length; i++) {
                    var category = categories[i];
                    self.pos_category_by_id[category.id] = category;
                }
                _.each(categories, function (category) {
                    category.parent = self.pos_category_by_id[category.parent_id[0]];
                });
                _super_loaded_product_category_model(self, categories);
                self.db.add_categories(categories);
            };
            var product_model = this.get_model('product.product');
            product_model.fields.push(
                'name',
                'is_credit',
                'multi_category',
                'multi_uom',
                'multi_variant',
                'supplier_barcode',
                'is_combo',
                'combo_limit',
                'uom_po_id',
                'barcode_ids',
                'pos_categ_ids',
                'supplier_taxes_id',
                'volume',
                'weight',
                'description_sale',
                'description_picking',
                'type',
                'cross_selling',
                'standard_price',
                'pos_sequence',
                'is_voucher',
                'minimum_list_price',
                'sale_with_package',
                'qty_warning_out_stock',
                'write_date',
                'is_voucher',
                'combo_price',
                'is_combo_item',
                'name_second',
                'note_ids',
                'tag_ids',
                'commission_rate',
                'company_id',
                'uom_ids',
                'product_template_attribute_value_ids',
            );
            this.bus_location = null;
            var partner_model = this.get_model('res.partner');
            partner_model.fields.push(
                'display_name',
                'parent_id',
                'ref',
                'vat',
                'comment',
                'discount_id',
                'credit',
                'debit',
                'balance',
                'limit_debit',
                'wallet',
                'property_product_pricelist',
                'property_payment_term_id',
                'is_company',
                'write_date',
                'birthday_date',
                'group_ids',
                'title',
                'company_id',
                'pos_loyalty_point',
                'pos_loyalty_type',
                'pos_order_count',
                'pos_total_amount',
            );
            var pricelist_model = this.get_model('product.pricelist');
            pricelist_model.fields.push('id', 'currency_id');
            pricelist_model['pricelist'] = true;
            var _super_pricelist_loaded = pricelist_model.loaded;
            pricelist_model.loaded = function (self, pricelists) {
                self.pricelist_currency_ids = [];
                self.pricelist_by_id = {};
                for (var i = 0; i < pricelists.length; i++) {
                    var pricelist = pricelists[i];
                    if (pricelist.currency_id) {
                        pricelist.name = pricelist.name + '(' + pricelist.currency_id[1] + ')'
                    }
                    self.pricelist_by_id[pricelist.id] = pricelist;
                    if (pricelist.currency_id) {
                        self.pricelist_currency_ids.push(pricelist.currency_id[0])
                    }
                }
                _super_pricelist_loaded(self, pricelists);
            };
            var pricelist_item_model = this.get_model('product.pricelist.item');
            pricelist_item_model['pricelist'] = true;
            var payment_method_object = this.get_model('pos.payment.method');
            var _super_payment_method_loaded = payment_method_object.loaded;
            payment_method_object.fields = payment_method_object.fields.concat(['cash_journal_id', 'fullfill_amount']);
            payment_method_object.loaded = function (self, payment_methods) {
                self.payment_methods = payment_methods;
                _super_payment_method_loaded(self, payment_methods);
            };
            var res_users_object = this.get_model('res.users');
            if (res_users_object) {
                res_users_object.fields = res_users_object.fields.concat([
                    'pos_security_pin',
                    'barcode',
                    'pos_config_id',
                    'partner_id',
                    'company_ids',
                ]);
                // todo: move load res.users after pos.config, we dont want load res.users after partners or products because we need checking company_ids of user
                var res_users = _.filter(this.models, function (model) {
                    return model.model == 'res.users';
                });
                this.models = _.filter(this.models, function (model) {
                    return model.model != 'res.users';
                })
                if (res_users) {
                    var index_number_pos_config = null;
                    for (var i = 0; i < this.models.length; i++) {
                        var model = this.models[i];
                        if (model.model == 'pos.config') {
                            index_number_pos_config = i;
                            break
                        }
                    }
                    for (var i = 0; i < res_users.length; i++) {
                        var user_model = res_users[i];
                        this.models.splice(index_number_pos_config + 1, 0, user_model)
                    }
                }
            }
            var pos_session_model = this.get_model('pos.session');
            pos_session_model.fields.push('lock_state');
            var pos_config_model = this.get_model('pos.config');
            var _pos_config_loaded = pos_config_model.loaded;
            pos_config_model.loaded = function (self, configs) {
                _pos_config_loaded(self, configs);
                self.config.sync_to_pos_config_ids = _.filter(self.config.sync_to_pos_config_ids, function (id) {
                    return id != self.config.id
                })
            };
            _super_PosModel.initialize.apply(this, arguments);
            var employee_model = this.get_model('hr.employee');
            if (employee_model) {
                var _super_employee_model_loaded = employee_model.loaded;
                employee_model.loaded = function (self, employees) {
                    _super_employee_model_loaded(self, employees);
                    self.employee_by_id = {};
                    for (var i = 0; i < employees.length; i++) {
                        var emp = employees[i];
                        self.employee_by_id[emp.id] = emp;
                    }
                };
            }

        },
        async add_new_order() {
            _super_PosModel.add_new_order.apply(this, arguments);
            var order = this.get_order();
            var client = order.get_client();
            if (!client && this.config.customer_default_id) {
                var client_default = this.db.get_partner_by_id(this.config.customer_default_id[0]);
                var order = this.get_order();
                order.set_client(client_default);
            }
            if (!order.get_client() && this.config.add_customer_before_products_already_in_shopping_cart && this.chrome) {
                const {confirmed, payload: newClient} = await this.chrome.showTempScreen(
                    'ClientListScreen',
                    {client: null}
                );
                if (confirmed) {
                    order.set_client(newClient);
                }
            }
        },
        formatDateTime: function (value, field, options) {
            if (value === false) {
                return "";
            }
            if (!options || !('timezone' in options) || options.timezone) {
                value = value.clone().add(session.getTZOffset(value), 'minutes');
            }
            return value.format(time.getLangDatetimeFormat());
        },
        format_date: function (date) { // covert datetime backend to pos
            if (date) {
                return this.formatDateTime(
                    moment(date), {}, {timezone: true});
            } else {
                return ''
            }
        },
        get_config: function () {
            return this.config;
        },
        get_packaging_by_product: function (product) {
            if (!this.packaging_by_product_id || !this.packaging_by_product_id[product.id]) {
                return false;
            } else {
                return true
            }
        },
        get_default_sale_journal: function () {
            var invoice_journal_id = this.config.invoice_journal_id;
            if (!invoice_journal_id) {
                return null
            } else {
                return invoice_journal_id[0];
            }
        },
        get_bus_location: function () {
            return this.bus_location
        },
        alert_message: function (options) {
            let from = options['from'] || 'right';
            let align = options['align'] || 'top';
            let title = options['title'] || 'Message'
            let timer = options['timer'] || 500;
            let color = options['color'] || 'danger'
            let body = options.body || ''
            try {
                $.notify({
                    icon: "notifications",
                    message: "<b>" + title + "</b> - " + body

                }, {
                    type: color,
                    timer: timer,
                    placement: {
                        from: from,
                        align: align
                    }
                });
            } catch (e) {
                this.chrome.props.webClient.do_warn(title, body, true)
            }
        },
        query_backend_fail: function (error) {
            if (error && error.message && error.message.code && error.message.code == 200) {
                return this.chrome.showPopup('ConfirmPopup', {
                    title: error.message.code,
                    body: error.message.data.message,
                })
            }
            if (error && error.message && error.message.code && error.message.code == -32098) {
                return this.chrome.showPopup('ConfirmPopup', {
                    title: error.message.code,
                    body: 'Your Odoo Server Offline',
                })
            } else {
                return this.chrome.showPopup('ConfirmPopup', {
                    title: 'Error',
                    body: 'Odoo offline mode or backend codes have issues. Please contact your admin system',
                })
            }
        }
        ,
        async scan_product(parsed_code) {
            /*
                    This function only return true or false
                    Because if barcode passed mapping data of products, customers ... will return true
                    Else all return false and popup warning message
             */
            var self = this;
            console.log('-> scan barcode: ' + parsed_code.code);
            const barcodeScanned = parsed_code.code
            const product = this.db.get_product_by_barcode(parsed_code.code);
            let lots = this.lots.filter(l => l.barcode == parsed_code.code);
            const selectedOrder = this.get_order();
            var products_by_supplier_barcode = this.db.product_by_supplier_barcode[parsed_code.code];
            var barcodes = this.barcodes_by_barcode[parsed_code.code];
            lots = _.filter(lots, function (lot) {
                var product_id = lot.product_id[0];
                var product = self.db.product_by_id[product_id];
                return product != undefined
            });
            // scan barcode of packaging, auto fill quantity of pack
            var productQuantityPacks = this.packagings.filter(pack => pack.barcode == barcodeScanned)
            if (productQuantityPacks.length) {
                let list = productQuantityPacks.map(pack => ({
                    label: pack.name + this.env._t(' with barcode ' + pack.barcode),
                    item: pack,
                    id: pack.id
                }));
                let {confirmed, payload: packSelected} = await this.chrome.showPopup('SelectionPopup', {
                    title: _t('Select one Product Packaging'),
                    list: list,
                });
                if (confirmed) {
                    var productOfPack = this.db.product_by_id[packSelected.product_id[0]];
                    if (productOfPack) {
                        selectedOrder.add_product(productOfPack, {quantity: packSelected.qty, merge: false});
                        var order_line = selectedOrder.get_selected_orderline();
                        order_line.price_manually_set = true;
                        if (packSelected.list_price > 0) {
                            order_line.set_unit_price(packSelected['list_price']);
                        }
                        return true
                    }
                }
            }
            // scan lots
            if (lots && lots.length) {
                const list = lots.map(l => (
                    {
                        label: l.barcode,
                        item: l,
                        id: l.id
                    }
                ))
                let {confirmed, payload: lot} = await this.chrome.showPopup('SelectionPopup', {
                    title: _t('Select one Lot Serial'),
                    list: list,
                });
                if (confirmed) {
                    var productOfLot = this.db.product_by_id[lot.product_id[0]];
                    if (productOfLot) {
                        selectedOrder.add_product(productOfLot, {merge: false});
                        var order_line = selectedOrder.get_selected_orderline();
                        if (order_line) {
                            if (lot.replace_product_public_price && lot.public_price) {
                                order_line.set_unit_price(lot['public_price'])
                                order_line.price_manually_set = true;
                            }
                            var pack_models = order_line.pack_lot_lines.models;
                            if (pack_model) {
                                for (var i = 0; i < pack_models.length; i++) {
                                    var pack_model = pack_models[i];
                                    pack_model.set_lot_name(lot['name'], lot);
                                }
                                order_line.trigger('change', order_line);
                            }
                        }
                        return true
                    }
                }
            }

            // scan supplier barcode
            if (products_by_supplier_barcode) {
                let list = products_by_supplier_barcode.map(p => ({
                    id: p.id,
                    label: p.display_name,
                    item: p

                }))
                if (product) {
                    list.push({
                        id: product.id,
                        label: product.display_name,
                        item: product
                    })
                }
                let {confirmed, payload: productSelected} = await this.chrome.showPopup('SelectionPopup', {
                    title: _t('Select one product'),
                    list: list,
                });
                if (confirmed) {
                    if (parsed_code.type === 'price') {
                        selectedOrder.add_product(productSelected, {
                            quantity: 1,
                            price: product['lst_price'],
                            merge: true
                        });
                    } else if (parsed_code.type === 'weight') {
                        selectedOrder.add_product(productSelected, {
                            quantity: 1,
                            price: product['lst_price'],
                            merge: false
                        });
                    } else if (parsed_code.type === 'discount') {
                        selectedOrder.add_product(productSelected, {discount: parsed_code.value, merge: false});
                    } else {
                        selectedOrder.add_product(productSelected);
                    }
                    return true
                }
            }
            // scan via multi barcode
            if (!product && barcodes) { // not have product but have barcodes
                var list = barcodes.map(b => ({
                    id: b.id,
                    item: b,
                    label: b.product_id[1] + this.env._t(' with Units: ') + b.uom_id[1]
                }));
                let {confirmed, payload: barcodeSelected} = await this.chrome.showPopup('SelectionPopup', {
                    title: _t('Select Product add to Cart'),
                    list: list,
                })
                if (confirmed) {
                    var productOfBarcode = self.db.product_by_id[barcodeSelected['product_id'][0]];
                    if (productOfBarcode) {
                        var pricelist_id = barcodeSelected.pricelist_id[0];
                        var pricelist = this.pricelist_by_id[pricelist_id];
                        if (pricelist) {
                            selectedOrder.set_pricelist(pricelist)
                        }
                        selectedOrder.add_product(productOfBarcode, {
                            quantity: 1,
                            extras: {
                                uom_id: barcodeSelected['uom_id'][0]
                            }
                        });
                        var uom_id = barcodeSelected.uom_id[0];
                        var uom = this.uom_by_id[uom_id];
                        if (uom && selectedOrder.pricelist) {
                            var price = productOfBarcode.get_price(product, selectedOrder.pricelist, 1, uom_id);
                            selectedOrder.selected_orderline.set_unit(uom_id, price)
                        }
                        return true
                    }
                }
            }
            const resultOfCore = _super_PosModel.scan_product.apply(this, arguments);
            // voucher
            if (!product && barcodeScanned) {
                let voucher = await this.rpc({
                    model: 'pos.voucher',
                    method: 'get_voucher_by_code',
                    args: [barcodeScanned],
                })
                if (voucher != -1) {
                    selectedOrder.client_use_voucher(voucher)
                    return true
                }
            }
            if (!resultOfCore) {
                this.chrome.showPopup('ErrorPopup', {
                    title: this.env._t('So sad'),
                    body: this.env._t('We not found any item with barcode: ' + barcodeScanned)
                })
            }
            return resultOfCore
        },
        get_image_url_by_model: function (record, model) {
            return window.location.origin + '/web/image?model=' + model + '&field=image_128&id=' + record.id;
        },
        async buildReport(report_html) {
            const printer = new Printer();
            const ticketImage = await printer.htmlToImg(report_html);
            return 'data:image/png;base64,' + ticketImage
        },

        getReceiptEnv() {
            let selectedOrder = this.get_order();
            let receiptEnv = selectedOrder.getOrderReceiptEnv();
            receiptEnv['pos'] = this;
            if (this.company.contact_address) {
                receiptEnv.receipt.contact_address = this.company.contact_address
            }
            let orderlines_by_category_name = {};
            let order = this.get_order();
            let orderlines = order.orderlines.models;
            let categories = [];
            if (this.config.category_wise_receipt) {
                for (let i = 0; i < orderlines.length; i++) {
                    let line = orderlines[i];
                    let line_print = line.export_for_printing();
                    line['product_name_wrapped'] = line_print['product_name_wrapped'][0];
                    let pos_categ_id = line['product']['pos_categ_id'];
                    if (pos_categ_id && pos_categ_id.length == 2) {
                        let root_category_id = order.get_root_category_by_category_id(pos_categ_id[0]);
                        let category = this.db.category_by_id[root_category_id];
                        let category_name = category['name'];
                        if (!orderlines_by_category_name[category_name]) {
                            orderlines_by_category_name[category_name] = [line];
                            let category_index = _.findIndex(categories, function (category) {
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
                        let category_index = _.findIndex(categories, function (category) {
                            return category == 'None';
                        });
                        if (category_index == -1) {
                            categories.push('None')
                        }
                    }
                }
            }
            receiptEnv['orderlines_by_category_name'] = orderlines_by_category_name;
            receiptEnv['categories'] = categories;
            receiptEnv['total_paid'] = order.get_total_paid(); // save amount due if have (display on receipt of partial order)
            receiptEnv['total_due'] = order.get_due(); // save amount due if have (display on receipt of partial order)
            receiptEnv['invoice_ref'] = order.invoice_ref;
            receiptEnv['picking_ref'] = order.picking_ref;
            receiptEnv['order_fields_extend'] = order.order_fields_extend;
            receiptEnv['delivery_fields_extend'] = order.delivery_fields_extend;
            receiptEnv['invoice_fields_extend'] = order.invoice_fields_extend;
            return receiptEnv
        },
        _get_voucher_env: function (voucher) {
            var cashier = this.get_cashier();
            var company = this.company;
            return {
                widget: this,
                pos: this,
                cashier: cashier,
                company: company,
                voucher: voucher
            };
        },
        _render_vouchers: function (vouchers_created) {
            var el_pos_receipt = $('.pos-receipt-container');
            var url_location = window.location.origin + '/report/barcode/EAN13/';
            for (var i = 0; i < vouchers_created.length; i++) {
                var voucher = vouchers_created[i];
                voucher['url_barcode'] = url_location + voucher['code'];
                el_pos_receipt.append(
                    qweb.render('VoucherCard', this._get_voucher_env(voucher))
                );
            }
        },
        format_currency: function (amount, precision) {
            var order_selected = this.get_order();
            if (order_selected && order_selected.currency) {
                var currency = (order_selected && order_selected.currency) ? order_selected.currency : {
                    symbol: '$',
                    position: 'after',
                    rounding: 0.01,
                    decimals: 2
                };
                amount = this.format_currency_no_symbol(amount, precision);
                if (currency.position === 'after') {
                    return amount + ' ' + (currency.symbol || '');
                } else {
                    return (currency.symbol || '') + ' ' + amount;
                }
            } else {
                return _super_PosModel.format_currency.call(this, amount, precision);
            }
        },
        _save_to_server: function (orders, options) {
            var self = this;
            this.partner_need_update_ids = [];
            this.wait_print_voucher = false;
            if (orders.length) {
                for (var n = 0; n < orders.length; n++) {
                    if (!orders[n]['data']) {
                        continue
                    }
                    var order = orders[n]['data'];
                    if (order.partner_id) {
                        this.partner_need_update_ids.push(order.partner_id)
                    }
                    for (var i = 0; i < order.lines.length; i++) {
                        var line = order.lines[i][2];
                        if (line.voucher) {
                            this.wait_print_voucher = true;
                            break;
                        }
                    }
                }
            }
            return _super_PosModel._save_to_server.call(this, orders, options).then(function (pos_order_backend_ids) {
                if (pos_order_backend_ids.length == 1) {
                    if (pos_order_backend_ids) {
                        var frontend_order = self.get_order();
                        for (var i = 0; i < pos_order_backend_ids.length; i++) {
                            var backend_order = pos_order_backend_ids[i];
                            if (frontend_order && frontend_order.ean13 == backend_order['ean13']) {
                                frontend_order.invoice_ref = backend_order.invoice_ref;
                                frontend_order.picking_ref = backend_order.picking_ref;
                                if (backend_order.included_order_fields_extend) {
                                    frontend_order.order_fields_extend = backend_order.order_fields_extend;
                                }
                                if (backend_order.included_delivery_fields_extend) {
                                    frontend_order.delivery_fields_extend = backend_order.delivery_fields_extend;
                                }
                                if (backend_order.included_invoice_fields_extend) {
                                    frontend_order.invoice_fields_extend = backend_order.invoice_fields_extend;
                                }

                            }
                        }
                    }
                    if (self.partner_need_update_ids.length) {
                        for (var i = 0; i < self.partner_need_update_ids.length; i++) {
                            self.load_new_partners(self.partner_need_update_ids[i]);
                        }
                    }
                    if (self.wait_print_voucher) {
                        self.rpc.query({
                            model: 'pos.voucher',
                            method: 'get_vouchers_by_order_ids',
                            args: [[], _.pluck(pos_order_backend_ids, 'id')]
                        }).then(function (vouchers_created) {
                            if (vouchers_created.length) {
                                self.wait_print_voucher = false;
                                self.vouchers_created = vouchers_created;
                                self._render_vouchers(self.vouchers_created);
                            }
                        })
                    }
                }
                self.partner_need_update_ids = [];
                return pos_order_backend_ids
            });
        },
        push_single_order: function (order, opts) {
            var pushed = _super_PosModel.push_single_order.call(this, order, opts);
            if (!order) {
                return pushed;
            }
            var client = order && order.get_client();
            if (client) {
                for (var i = 0; i < order.paymentlines.models.length; i++) {
                    var line = order.paymentlines.models[i];
                    var amount = line.get_amount();
                    var pos_method_type = line.payment_method.pos_method_type;
                    if (pos_method_type == 'wallet') {
                        client.wallet = -amount;
                    }
                    if (pos_method_type == 'credit') {
                        client.balance -= line.get_amount();
                    }
                }
            }
            return pushed;
        },
        push_and_invoice_order: function (order) {
            if (!this.config.receipt_manual_download_invoice) {
                return _super_PosModel.push_and_invoice_order.call(this, order);
            } else {
                return _super_PosModel.push_single_order.call(this, order);
            }
        },
        requesting_another_sessions_sync: function () {
            rpc.query({
                model: 'pos.cache.database',
                method: 'send_notification_pos_sessions_online_action_update',
                args: [[], 'pos.listen.event.backend.update'],
            })
        }
        ,
        get_balance: function (client) {
            var balance = round_pr(client.balance, this.currency.rounding);
            return (Math.round(balance * 100) / 100).toString()
        }
        ,
        get_wallet: function (client) {
            var wallet = round_pr(client.wallet, this.currency.rounding);
            return (Math.round(wallet * 100) / 100).toString()
        }
        ,
        add_return_order: function (order_return, lines) {
            var self = this;
            var order_return_id = order_return['id'];
            var order_selected_state = order_return['state'];
            var partner_id = order_return['partner_id'];
            var return_order_id = order_return['id'];
            var order = new models.Order({}, {pos: this});
            order['is_return'] = true;
            order['return_order_id'] = return_order_id;
            order['pos_reference'] = 'Return/' + order['name'];
            order['name'] = 'Return/' + order['name'];
            this.get('orders').add(order);
            if (partner_id && partner_id[0]) {
                var client = this.db.get_partner_by_id(partner_id[0]);
                if (client) {
                    order.set_client(client);
                }
            }
            this.set('selectedOrder', order);
            for (var i = 0; i < lines.length; i++) {
                var line_return = lines[i];
                if (line_return['is_return']) {
                    this.db.remove_order(order.id);
                    order.destroy({'reason': 'abandon'});
                    return this.chrome.showPopup('ConfirmPopup', {
                        title: _t('Warning'),
                        body: _t('This order is order return before, it not possible return again')
                    })
                }
                var price = line_return['price_unit'];
                if (price < 0) {
                    price = -price;
                }
                var quantity = 0;
                var product = this.db.get_product_by_id(line_return.product_id[0]);
                if (!product) {
                    this.db.remove_order(order.id);
                    order.destroy({'reason': 'abandon'});
                    return this.chrome.showPopup('ConfirmPopup', {
                        title: _t('Warning'),
                        body: _t(line_return.product_id[0] + ' not available in POS, it not possible made return')
                    })
                }
                var line = new models.Orderline({}, {
                    pos: this,
                    order: order,
                    product: product,
                });
                order.orderlines.add(line);
                // todo: set lot back
                var pack_operation_lots = this.pack_operation_lots_by_pos_order_line_id[line_return.id];
                if (pack_operation_lots) {
                    var multi_lot_ids = [];
                    var lot_name_manual = null;
                    for (var i = 0; i < pack_operation_lots.length; i++) {
                        var pack_operation_lot = pack_operation_lots[i];
                        if (pack_operation_lot.lot_id) {
                            multi_lot_ids.push({
                                'id': pack_operation_lot.lot_id[0],
                                'quantity': pack_operation_lot.quantity
                            })
                        } else {
                            lot_name_manual = pack_operation_lot.lot_name
                        }
                    }
                    if (multi_lot_ids.length) { // todo: only for multi lot
                        line.set_multi_lot(multi_lot_ids)
                    }
                    if (lot_name_manual) { // todo: only for one lot
                        var pack_lot_lines = line.compute_lot_lines();
                        for (var i = 0; i < pack_lot_lines.models.length; i++) {
                            var pack_line = pack_lot_lines.models[i];
                            pack_line.set_lot_name(lot_name_manual)
                        }
                        pack_lot_lines.remove_empty_model();
                        pack_lot_lines.set_quantity_by_lot();
                        line.order.save_to_db();
                    }
                }
                if (line_return['variant_ids']) {
                    line.set_variants(line_return['variant_ids'])
                }
                if (line_return['tag_ids']) {
                    line.set_tags(line_return['tag_ids'])
                }
                line['returned_order_line_id'] = line_return['id'];
                line['is_return'] = true;
                line.set_unit_price(price);
                line.price_manually_set = true;
                if (line_return.discount)
                    line.set_discount(line_return.discount);
                if (line_return.discount_reason)
                    line.discount_reason = line_return.discount_reason;
                if (line_return['new_quantity']) {
                    quantity = -line_return['new_quantity']
                } else {
                    quantity = -line_return['qty']
                }
                if (line_return.promotion) {
                    quantity = -quantity;
                }
                if (line_return.redeem_point) {
                    quantity = -quantity;
                    line.credit_point = line_return.redeem_point;
                }
                if (quantity > 0) {
                    quantity = -quantity;
                }
                line.set_quantity(quantity, 'keep price when return');
            }
            if (this.combo_picking_by_order_id) {
                var combo_picking_id = this.combo_picking_by_order_id[return_order_id];
                if (combo_picking_id) {
                    moves = this.stock_moves_by_picking_id[combo_picking_id];
                    for (var n = 0; n < moves.length; n++) {
                        var price = 0;
                        var move = moves[n];
                        var product = this.db.get_product_by_id(move.product_id[0]);
                        if (!product) {
                            this.pos.gui.show_popup('dialog', {
                                title: 'Warning',
                                body: 'Product ID ' + move.product_id[1] + ' have removed out of POS. Take care'
                            });
                            continue
                        }
                        if (move.product_uom_qty == 0) {
                            continue
                        }
                        var line = new models.Orderline({}, {
                            pos: this,
                            order: order,
                            product: product,
                        });
                        order.orderlines.add(line);
                        line['is_return'] = true;
                        line.set_unit_price(price);
                        line.price_manually_set = true;
                        line.set_quantity(-move.product_uom_qty, 'keep price when return');
                    }
                }
            }

            if (order_selected_state.is_paid_full == false) {
                return new Promise(function (resolve, reject) {
                    rpc.query({
                        model: 'account.bank.statement.line',
                        method: 'search_read',
                        domain: [['pos_statement_id', '=', order_return_id]],
                        fields: [],
                    }).then(function (statements) {
                        var last_paid = 0;
                        for (var i = 0; i < statements.length; i++) {
                            var statement = statements[i];
                            last_paid += statement['amount'];
                        }
                        last_paid = self.format_currency(last_paid);
                        self.chrome.showPopup('dialog', {
                            'title': _t('Warning'),
                            'body': 'Selected Order need return is partial payment, and customer only paid: ' + last_paid + ' . Please return back money to customer correctly',
                        });
                        resolve()
                    }, function (error) {
                        reject()
                    })
                })
            } else {
                var payment_method = _.find(this.payment_methods, function (method) {
                    return method['journal'] && method['journal']['pos_method_type'] == 'default' && method['journal'].type == 'cash';
                });
                if (payment_method) {
                    order.add_paymentline(payment_method);
                    var amount_withtax = order.get_total_with_tax();
                    order.selected_paymentline.set_amount(amount_withtax);
                    order.trigger('change', order);
                    this.trigger('auto_update:paymentlines', this);
                }
            }
        },
        add_refill_order: function (order, lines) {
            var partner_id = order['partner_id'];
            var order = new models.Order({}, {pos: this});
            this.get('orders').add(order);
            if (partner_id && partner_id[0]) {
                var client = this.db.get_partner_by_id(partner_id[0]);
                if (client) {
                    order.set_client(client);
                }
            }
            this.set('selectedOrder', order);
            for (var i = 0; i < lines.length; i++) {
                var line_refill = lines[i];
                var price = line_refill['price_unit'];
                if (price < 0) {
                    price = -price;
                }
                var quantity = 0;
                var product = this.db.get_product_by_id(line_refill.product_id[0]);
                if (!product) {
                    console.error('Could not find product: ' + line_refill.product_id[0]);
                    continue
                }
                var line = new models.Orderline({}, {
                    pos: this,
                    order: order,
                    product: product,
                });
                order.orderlines.add(line);
                if (line_refill['variant_ids']) {
                    line.set_variants(line_refill['variant_ids'])
                }
                if (line_refill['tag_ids']) {
                    line.set_tags(line_refill['tag_ids'])
                }
                line.set_unit_price(price);
                line.price_manually_set = true;
                if (line_refill.discount)
                    line.set_discount(line_refill.discount);
                if (line_refill.discount_reason)
                    line.discount_reason = line_refill.discount_reason;
                if (line_refill['new_quantity']) {
                    quantity = line_refill['new_quantity']
                } else {
                    quantity = line_refill['qty']
                }
                line.set_quantity(quantity, 'keep price when return');
            }
        }
        ,
        lock_order: function () {
            $('.rightpane').addClass('oe_hidden');
            $('.timeline').addClass('oe_hidden');
            $('.find_customer').addClass('oe_hidden');
            $('.leftpane').css({'left': '0px'});
            $('.numpad').addClass('oe_hidden');
            $('.actionpad').addClass('oe_hidden');
            $('.deleteorder-button').addClass('oe_hidden');
        }
        ,
        unlock_order: function () {
            $('.rightpane').removeClass('oe_hidden');
            $('.timeline').removeClass('oe_hidden');
            $('.find_customer').removeClass('oe_hidden');
            $('.numpad').removeClass('oe_hidden');
            $('.actionpad').removeClass('oe_hidden');
            if (this.config.staff_level == 'manager') {
                $('.deleteorder-button').removeClass('oe_hidden');
            }
        }
        ,
        load_server_data_by_model: function (model) {
            var self = this;
            var tmp = {};
            var fields = typeof model.fields === 'function' ? model.fields(self, tmp) : model.fields;
            var domain = typeof model.domain === 'function' ? model.domain(self, tmp) : model.domain;
            var context = typeof model.context === 'function' ? model.context(self, tmp) : model.context || {};
            var ids = typeof model.ids === 'function' ? model.ids(self, tmp) : model.ids;
            var order = typeof model.order === 'function' ? model.order(self, tmp) : model.order;
            console.log('{Model.js} load_server_data_by_model model: ' + model.model);
            var loaded = new Promise(function (resolve, reject) {
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
                rpc.query(params).then(function (result) {
                    try {    // catching exceptions in model.loaded(...)
                        Promise.resolve(model.loaded(self, result, tmp)).then(function () {
                            resolve()
                        }, function (err) {
                            reject(err);
                        });
                    } catch (err) {
                        reject()
                    }
                }, function (err) {
                    reject()
                });
            });
            return loaded;
        }
    });
//
// //TODO: validate click change minus
// var _super_NumpadState = models.NumpadState.prototype;
// models.NumpadState = models.NumpadState.extend({
//     switchSign: function () {
//         self.posmodel.switchSign = this;
//         if (self.posmodel.config.validate_change_minus) {
//             return self.posmodel.gui.show_popup('ask_password', {
//                 title: 'Pos pass pin ?',
//                 body: 'Please use pos security pin for unlock',
//                 confirm: function (value) {
//                     var pin;
//                     if (self.posmodel.config.manager_validate) {
//                         var user_validate = self.posmodel.user_by_id[this.pos.config.manager_user_id[0]];
//                         pin = user_validate['pos_security_pin']
//                     } else {
//                         pin = self.posmodel.user.pos_security_pin
//                     }
//                     if (value != pin) {
//                         return self.posmodel.gui.show_popup('dialog', {
//                             title: 'Wrong',
//                             body: 'Pos security pin not correct'
//                         })
//                     } else {
//                         return _super_NumpadState.switchSign.apply(this.pos.switchSign, arguments);
//                     }
//                 }
//             });
//         } else {
//             return _super_NumpadState.switchSign.apply(this, arguments);
//         }
//     }
// });

// TODO: PROBLEM IS ( if we have 100k, 500k or few millions products record ) and when change pricelist, take a lot times render qweb
// TODO SOLUTION: we force method get_price of product recordset to posmodel, see to method get_price of LoadModel.js
    models.Product = models.Product.extend({
        /*
            We not use exports.Product because if you have 1 ~ 10 millions data products
            Original function odoo will crashed browse memory
         */
        covertCurrency(pricelist, price) {
            var baseCurrency = this.pos.currency_by_id[this.pos.config.currency_id[0]];
            if (pricelist.currency_id && baseCurrency && baseCurrency.id != pricelist.currency_id[0]) {
                var currencySelected = this.pos.currency_by_id[pricelist.currency_id[0]];
                if (currencySelected && currencySelected['converted_currency'] != 0) {
                    price = (currencySelected['converted_currency'] * price);
                }
            }
            return price

        },
        get_price: function (pricelist, quantity, uom_id) {
            var self = this;
            if (!quantity) {
                quantity = 1
            }
            if (!pricelist) {
                return self['lst_price'];
            }
            if (pricelist['items'] == undefined) {
                return self['lst_price'];
            }
            var date = moment().startOf('day');
            var category_ids = [];
            var category = self.categ;
            while (category) {
                category_ids.push(category.id);
                category = category.parent;
            }
            var pos_category_ids = []
            var pos_category = self.pos_category;
            while (pos_category) {
                pos_category_ids.push(pos_category.id);
                pos_category = pos_category.parent;
            }
            var pricelist_items = [];
            for (var i = 0; i < pricelist.items.length; i++) {
                var item = pricelist.items[i];
                var theSameUnit = !item.uom_id || (!uom_id && self.uom_id && item.uom_id && item.uom_id[0] == self.uom_id[0]) || (uom_id != undefined)
                if ((!item.product_tmpl_id || item.product_tmpl_id[0] === self.product_tmpl_id) &&
                    (!item.product_id || item.product_id[0] === self.id) &&
                    (!item.categ_id || _.contains(category_ids, item.categ_id[0])) &&
                    (!item.pos_category_id || _.contains(pos_category_ids, item.pos_category_id[0])) &&
                    (!item.date_start || moment(item.date_start).isSameOrBefore(date)) &&
                    (theSameUnit) &&
                    (!item.date_end || moment(item.date_end).isSameOrAfter(date))) {
                    if (!uom_id) {
                        pricelist_items.push(item)
                    } else {
                        // TODO: if have parameter uom_id, we get only one pricelist item have set uom ID the same with param and break
                        if (item.product_id && item.product_id[0] == self.id && item.uom_id && item.uom_id[0] == uom_id) {
                            pricelist_items = [item]
                            break;
                        }
                    }

                }
            }
            var price = self['lst_price'];
            _.find(pricelist_items, function (rule) {
                if (rule.min_quantity && quantity < rule.min_quantity) {
                    return false;
                }
                if (rule.base === 'pricelist') {
                    price = self.get_price(rule.base_pricelist, quantity, uom_id);
                } else if (rule.base === 'standard_price') {
                    price = self.standard_price;
                }
                if (rule.compute_price === 'fixed') {
                    price = rule.fixed_price;
                    return true;
                } else if (rule.compute_price === 'percentage') {
                    price = price - (price * (rule.percent_price / 100));
                    return true;
                } else {
                    var price_limit = price;
                    price = price - (price * (rule.price_discount / 100));
                    if (rule.price_round) {
                        price = round_pr(price, rule.price_round);
                    }
                    if (rule.price_surcharge) {
                        price += rule.price_surcharge;
                    }
                    if (rule.price_min_margin) {
                        price = Math.max(price, price_limit + rule.price_min_margin);
                    }
                    if (rule.price_max_margin) {
                        price = Math.min(price, price_limit + rule.price_max_margin);
                    }
                    return true;
                }
                return false;
            });
            price = this.covertCurrency(pricelist, price);
            return price;
        }
        ,
        /*
            This function return product amount with default tax set on product > sale > taxes
         */
        get_price_with_tax: function (pricelist) {
            var self = this;
            var price;
            if (pricelist) {
                price = this.get_price(pricelist, 1);
            } else {
                price = self['lst_price'];
            }
            var taxes_id = self['taxes_id'];
            if (!taxes_id) {
                return price;
            }
            var tax_amount = 0;
            var base_amount = price;
            if (taxes_id.length > 0) {
                for (var index_number in taxes_id) {
                    var tax = self.pos.taxes_by_id[taxes_id[index_number]];
                    if ((tax && tax.price_include) || !tax) {
                        continue;
                    } else {
                        if (tax.amount_type === 'fixed') {
                            var sign_base_amount = base_amount >= 0 ? 1 : -1;
                            tax_amount += Math.abs(tax.amount) * sign_base_amount;
                        }
                        if ((tax.amount_type === 'percent' && !tax.price_include) || (tax.amount_type === 'division' && tax.price_include)) {
                            tax_amount += base_amount * tax.amount / 100;
                        }
                        if (tax.amount_type === 'percent' && tax.price_include) {
                            tax_amount += base_amount - (base_amount / (1 + tax.amount / 100));
                        }
                        if (tax.amount_type === 'division' && !tax.price_include) {
                            tax_amount += base_amount / (1 - tax.amount / 100) - base_amount;
                        }
                    }
                }
            }
            if (tax_amount) {
                return price + tax_amount
            } else {
                return price
            }
        },
    });
    var _super_Paymentline = models.Paymentline.prototype;
    models.Paymentline = models.Paymentline.extend({
        init_from_JSON: function (json) {
            var res = _super_Paymentline.init_from_JSON.apply(this, arguments);
            if (json.ref) {
                this.ref = json.ref
            }
            if (json.add_partial_amount_before) {
                this.add_partial_amount_before = json.add_partial_amount_before
            }
            if (json.voucher_id) {
                this.voucher_id = json.voucher_id
            }
            if (json.voucher_code) {
                this.voucher_code = json.voucher_code
            }
            return res
        },
        export_as_JSON: function () {
            var json = _super_Paymentline.export_as_JSON.apply(this, arguments);
            if (this.ref) {
                json['ref'] = this.ref;
            }
            if (this.voucher_id) {
                json['voucher_id'] = this.voucher_id;
            }
            if (this.voucher_code) {
                json['voucher_code'] = this.voucher_code;
            }
            if (this.add_partial_amount_before) {
                json['add_partial_amount_before'] = this.add_partial_amount_before;
            }
            return json
        },
        export_for_printing: function () {
            var datas = _super_Paymentline.export_for_printing.apply(this, arguments);
            if (this.ref) {
                datas['ref'] = this.ref
            }
            if (this.voucher_id) {
                datas['voucher_id'] = this.voucher_id
            }
            if (this.voucher_code) {
                datas['voucher_code'] = this.voucher_code
            }
            if (this.add_partial_amount_before) {
                datas['add_partial_amount_before'] = this.add_partial_amount_before
            }
            return datas
        },
        set_reference: function (ref) {
            this.ref = ref;
            this.trigger('change', this)
        },
        set_amount: function (value) {
            if (this.add_partial_amount_before) {
                return this.pos.gui.show_popup('ConfirmPopup', {
                    title: _t('Warning'),
                    body: this.ref + _t(' .Not allow edit amount of this payment line. If you wanted edit, please remove this Line')
                })
            }
            _super_Paymentline.set_amount.apply(this, arguments);

        },
    });
})
;
