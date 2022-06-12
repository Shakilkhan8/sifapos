odoo.define('pos_retail.ProductScreen', function (require) {
    'use strict';

    const ProductScreen = require('point_of_sale.ProductScreen');
    const Registries = require('point_of_sale.Registries');
    const core = require('web.core');
    const qweb = core.qweb;
    const {posbus} = require('point_of_sale.utils');
    var BarcodeEvents = require('barcodes.BarcodeEvents').BarcodeEvents;
    const {useListener} = require('web.custom_hooks');

    const RetailProductScreen = (ProductScreen) =>
        class extends ProductScreen {
            constructor() {
                super(...arguments);
                this.buffered_key_events = [];
                this._onKeypadKeyDown = this._onKeypadKeyDown.bind(this);
                useListener('show-popup', this.removeEventKeyboad);
                useListener('addCategory', this._addCategory);
                useListener('addProduct', this._addProduct);
            }

            async _addCategory() {
                let {confirmed, payload: results} = await this.showPopup('PopUpCreateCategory', {
                    title: this.env._t('Create new Category')
                })
                if (confirmed && results['name']) {
                    let value = {
                        name: results.name,
                        sequence: results.sequence
                    }
                    if (results.parent_id != 'null') {
                        value['parent_id'] = results['parent_id']
                    }
                    if (results.image_128) {
                        value['image_128'] = results.image_128.split(',')[1];
                    }
                    let category_id = await this.rpc({
                        model: 'pos.category',
                        method: 'create',
                        args: [value]
                    })
                    let newCategories = await this.rpc({
                        model: 'pos.category',
                        method: 'search_read',
                        args: [[['id', '=', category_id]]],
                    })
                    const pos_categ_model = this.env.pos.get_model('pos.category');
                    if (pos_categ_model) {
                        pos_categ_model.loaded(this.env.pos, newCategories, {});
                    }
                    this.render()
                }
            }

            async _addProduct() {
                let {confirmed, payload: results} = await this.showPopup('PopUpCreateProduct', {
                    title: this.env._t('Create new Product')
                })
                if (confirmed && results) {
                    let value = {
                        name: results.name,
                        list_price: results.list_price,
                        default_code: results.default_code,
                        barcode: results.barcode,
                        standard_price: results.standard_price,
                        type: results.type,
                        available_in_pos: true
                    }
                    if (results.pos_categ_id != 'null') {
                        value['pos_categ_id'] = results['pos_categ_id']
                    }
                    if (results.image_1920) {
                        value['image_1920'] = results.image_1920.split(',')[1];
                    }
                    this.rpc({
                        model: 'product.product',
                        method: 'create',
                        args: [value]
                    })
                }
            }

            mounted() {
                super.mounted();
                posbus.on('on-off-control-buttons', this, this.render);
                posbus.on('closed-popup', this, this.addEventKeyboad);
                this.addEventKeyboad()
                this.env.pos._do_update_quantity_onhand([])
                this.env.pos.get_modifiers_backend_all_models()
            }

            willUnmount() {
                super.willUnmount();
                posbus.off('on-off-control-buttons', this);
                posbus.off('closed-popup', this, null);
                this.removeEventKeyboad()
                this.env.pos._do_update_quantity_onhand([])
                this.env.pos.get_modifiers_backend_all_models()
            }

            addEventKeyboad() {
                console.log('add event keyboard')
                $(document).off('keydown.productscreen', this._onKeypadKeyDown);
                $(document).on('keydown.productscreen', this._onKeypadKeyDown);
            }

            removeEventKeyboad() {
                console.log('remove event keyboard')
                $(document).off('keydown.productscreen', this._onKeypadKeyDown);
            }

            _onKeypadKeyDown(ev) {
                if (!_.contains(["INPUT", "TEXTAREA"], $(ev.target).prop('tagName'))) {
                    clearTimeout(this.timeout);
                    this.buffered_key_events.push(ev);
                    this.timeout = setTimeout(_.bind(this._keyboardHandler, this), BarcodeEvents.max_time_between_keys_in_ms);
                }
                if (ev.keyCode == 27 || ev.keyCode == 13) {  // esc key
                    this.buffered_key_events.push(ev);
                    this.timeout = setTimeout(_.bind(this._keyboardHandler, this), BarcodeEvents.max_time_between_keys_in_ms);
                }
            }

            _keyboardHandler() {
                const selectedOrder = this.env.pos.get_order()
                const selecteLine = selectedOrder.get_selected_orderline()
                if (this.buffered_key_events.length > 2) {
                    this.buffered_key_events = [];
                    return true;
                }
                for (let i = 0; i < this.buffered_key_events.length; i++) {
                    let event = this.buffered_key_events[i]
                    console.log(event.keyCode)
                    // -------------------------- product screen -------------
                    let key = '';
                    if (event.keyCode == 13) { // space
                        const query = $('.search-box >input').val();
                        const products = this.env.pos.db.search_product_in_category(0, query)
                        if (products.length == 1) {
                            this._clickProduct({
                                detail: products[0]
                            })
                            $('.search-box >input').blur()
                            $('.clear-icon').click()
                        }
                    }
                    if (event.keyCode == 32) { // space
                        $(this.el).find('.pay').click()
                    }
                    if (event.keyCode == 27) { // esc
                        $('.search-box >input').blur()
                        $('.clear-icon').click()
                    }
                    if (event.keyCode == 67) { // c
                        $(this.el).find('.set-customer').click()
                    }
                    if (event.keyCode == 68) { // d
                        $(this.el).find('.mode_discount').click()
                    }
                    if (event.keyCode == 72) { // h
                        $(this.el).find('.breadcrumb-home').click()
                    }
                    if (event.keyCode == 79) { // o
                        $($('.ticket-button')[0]).click()
                    }
                    if (event.keyCode == 80) { // p
                        $(this.el).find('.mode_price').click()
                    }
                    if (event.keyCode == 81) { // q
                        $(this.el).find('.mode_quantity').click()
                    }
                    if (event.keyCode == 83) { // s
                        $('.search-box >input').focus()
                    }
                    if (event.keyCode == 187 && selecteLine) { // +
                        selecteLine.set_quantity(selecteLine.quantity + 1)
                    }
                    if (event.keyCode == 189 && selecteLine) { // -
                        let newQty = selecteLine.quantity - 1
                        setTimeout(function () {
                            selecteLine.set_quantity(newQty)
                        }, 200) // odoo core set to 0, i waiting 1/5 second set back -1
                    }
                }
                this.buffered_key_events = [];
            }

            async _onClickPay() {
                let selectedOrder = this.env.pos.get_order();
                if (selectedOrder.orderlines.length == 0) {
                    return this.showPopup('ErrorPopup', {
                        title: this.env._t('Error'),
                        body: this.env._t('Your order is blank cart'),
                    })
                }
                if (this.env.session.restaurant_order) {
                    if (!this.env.pos.first_order_succeed) {
                        const selectedOrder = this.env.pos.get_order()
                        let {confirmed, payload: guest_total} = await this.showPopup('NumberPopup', {
                            title: this.env._t('How many guests on your table ?'),
                            startingValue: 0
                        })
                        if (confirmed) {
                            selectedOrder.set_customer_count(parseInt(guest_total))
                        } else {
                            return this.showScreen('ProductScreen')
                        }
                    }
                    let {confirmed, payload: note} = await this.showPopup('TextAreaPopup', {
                        title: this.env._t('Have any notes for Cashiers/Kitchen Room of Restaurant ?'),
                    })
                    if (confirmed) {
                        if (note) {
                            selectedOrder.set_note(note)
                        }
                    }
                    if (selectedOrder.get_allow_sync()) {
                        let orderJson = selectedOrder.export_as_JSON()
                        orderJson.state = 'Waiting'
                        this.env.session.restaurant_order = false
                        this.env.pos.pos_bus.send_notification({
                            data: orderJson,
                            action: 'new_qrcode_order',
                            order_uid: selectedOrder.uid,
                        });
                        this.env.session.restaurant_order = true
                    } else {
                        return this.showPopup('Error', {
                            title: this.env._t('Error'),
                            body: this.env._t('POS missed setting Sync Between Sessions. Please contact your admin resolve it')
                        })
                    }
                    this.env.pos.config.login_required = false // todo: no need login when place order more items
                    this.env.pos.first_order_succeed = true
                    this.env.pos.placed_order = selectedOrder
                    return this.showTempScreen('RegisterScreen', {
                        selectedOrder: selectedOrder
                    })
                }
                if (this.env.pos.config.rounding_automatic) {
                    this.roundingTotalAmount()
                }
                super._onClickPay()
            }

            async _clickProduct(event) {
                const product = event.detail;
                if (this.env.pos.printBarcode) {
                    if (product.barcode) {
                        const reportXML = qweb.render('ProductBarcodeLabel', {
                            product: product
                        });
                        if (this.env.pos.config.proxy_ip && this.env.pos.config.iface_print_via_proxy) {
                            const printResult = await this.env.pos.proxy.printer.print_receipt(reportXML);
                            if (printResult.successful) {
                                this.showPopup('ConfirmPopup', {
                                    title: this.env._t('Printed'),
                                    body: product.display_name + this.env._t(' has printed. Check label at your printer')
                                })
                                return true;
                            }
                        } else {
                            return this.showPopup('ErrorPopup', {
                                title: this.env._t('Error'),
                                body: this.env._t('Print Barcode Label only support for POSBOX, not support IOTBOX or Print Web direct browse')
                            })
                        }
                    } else {
                        return this.showPopup('ErrorPopup', {
                            title: this.env._t('Error'),
                            body: product.display_name + this.env._t(' barcode not set')
                        })
                    }
                }
                if (this.env.pos.update_stock_active) {
                    let self = this;
                    this.product_need_update = event.detail;
                    if (this.product_need_update.type != 'product') {
                        return this.showPopup('ErrorPopup', {
                            title: this.env._t('Error'),
                            body: this.env._t('Quants cannot be created for consumables or services')
                        })
                    }
                    let stock_location_ids = this.env.pos.get_all_source_locations();
                    let stock_datas = await this.env.pos._get_stock_on_hand_by_location_ids([this.product_need_update.id], stock_location_ids).then(function (datas) {
                        return datas
                    });
                    if (stock_datas) {
                        let list = [];
                        for (let location_id in stock_datas) {
                            let location = this.env.pos.stock_location_by_id[location_id];
                            if (location) {
                                list.push({
                                    id: location.id,
                                    label: location.display_name + this.env._t(' with Stock: ') + stock_datas[location_id][this.product_need_update.id],
                                    item: location
                                })
                            }
                        }
                        let {confirmed, payload: location} = await this.showPopup('SelectionPopup', {
                            title: this.env._t('Please select Location need apply new stock on hand'),
                            list: list
                        })
                        if (confirmed) {
                            let location_id = location.id;
                            let {confirmed, payload: number} = await this.showPopup('NumberPopup', {
                                title: this.env._t('What number Stock on hand of Product: ') + this.product_need_update.display_name,
                                startingValue: stock_datas[location_id][this.product_need_update.id]
                            })
                            if (confirmed) {
                                let updateOnhand = await this.rpc({
                                    model: 'stock.location',
                                    method: 'pos_update_stock_on_hand_by_location_id',
                                    args: [location.id, {
                                        product_id: self.product_need_update.id,
                                        product_tmpl_id: self.product_need_update.product_tmpl_id,
                                        new_quantity: parseFloat(number),
                                        location_id: location_id
                                    }],
                                    context: {}
                                }, function (error) {
                                    return self.env.pos.query_backend_fail(error)
                                })
                                if (updateOnhand) {
                                    this.env.pos._do_update_quantity_onhand([this.product_need_update.id]);
                                    let newStockDatas = await this.env.pos._get_stock_on_hand_by_location_ids([this.product_need_update.id], stock_location_ids).then(function (datas) {
                                        return datas
                                    });
                                    return this.showPopup('ConfirmPopup', {
                                        title: this.env._t('Alert'),
                                        body: this.env._t('Stock on hand of Product: ') + this.product_need_update.display_name + this.env._t(' at Location: ') + location.display_name + this.env._t(' now is: ') + newStockDatas[location.id][this.product_need_update.id]
                                    })
                                }

                            }
                        }
                    }
                } else {
                    if (this.env.pos.config.fullfill_lots && ['serial', 'lot'].includes(event.detail.tracking)) {
                        let draftPackLotLines
                        let packLotLinesToEdit = await this.rpc({
                            model: 'stock.production.lot',
                            method: 'search_read',
                            domain: [['product_id', '=', event.detail.id]],
                            fields: ['name', 'id']
                        }).then(function (lots) {
                            return lots
                        }, function (error) {
                            return self.env.pos.query_backend_fail(error)
                        })
                        if (packLotLinesToEdit && packLotLinesToEdit.length) {
                            packLotLinesToEdit.forEach((l) => l.text = l.name);
                            const {confirmed, payload} = await this.showPopup('EditListPopup', {
                                title: this.env._t('Lot/Serial Number(s) Required'),
                                isSingleItem: false,
                                array: packLotLinesToEdit,
                            });
                            if (confirmed) {
                                const newPackLotLines = payload.newArray
                                    .filter(item => item.id)
                                    .map(item => ({lot_name: item.name}));
                                const modifiedPackLotLines = payload.newArray
                                    .filter(item => !item.id)
                                    .map(item => ({lot_name: item.text}));

                                draftPackLotLines = {modifiedPackLotLines, newPackLotLines};
                                if (newPackLotLines.length != 1) {
                                    return this.showPopup('ErrorPopup', {
                                        title: this.env._t('Error'),
                                        body: this.env._t('Please select only Lot, and remove another Lots')
                                    })
                                }
                                return this.currentOrder.add_product(event.detail, {
                                    draftPackLotLines,
                                    description: 'Auto fullfill lot',
                                    price_extra: 0,
                                    quantity: 1,
                                });
                            }
                        }
                    }
                    await super._clickProduct(event)
                    if (product.multi_variant && this.env.pos.variant_by_product_tmpl_id[product.product_tmpl_id]) {
                        let variants = this.env.pos.variant_by_product_tmpl_id[product.product_tmpl_id];
                        let {confirmed, payload: results} = await this.showPopup('PopUpMultiChoice', {
                            title: this.env._t('Select Variants and Values'),
                            items: variants
                        })
                        if (confirmed) {
                            let selectedOrder = this.env.pos.get_order();
                            let selectedLine = selectedOrder.get_selected_orderline();
                            let variantIds = results.items.map((i) => (i.id))
                            selectedLine.set_variants(variantIds);
                        }
                    }
                    if (product.cross_selling && this.env.pos.cross_items_by_product_tmpl_id[product.product_tmpl_id]) {
                        let crossItems = this.env.pos.cross_items_by_product_tmpl_id[product.product_tmpl_id];
                        let {confirmed, payload: results} = await this.showPopup('PopUpMultiChoice', {
                            title: this.env._t('Suggest buy more Products with ' + product.display_name),
                            items: crossItems
                        })
                        if (confirmed) {
                            let selectedOrder = this.env.pos.get_order();
                            let selectedCrossItems = results.items;
                            for (let index in selectedCrossItems) {
                                let item = selectedCrossItems[index];
                                let product = this.env.pos.db.get_product_by_id(item['product_id'][0]);
                                if (product) {
                                    if (!product) {
                                        continue
                                    }
                                    var price = item['list_price'];
                                    var discount = 0;
                                    if (item['discount_type'] == 'fixed') {
                                        price = price - item['discount']
                                    }
                                    if (item['discount_type'] == 'percent') {
                                        discount = item['discount']
                                    }
                                    selectedOrder.add_product(product, {
                                        quantity: item['quantity'],
                                        price: price,
                                        merge: false,
                                    });
                                    if (discount > 0) {
                                        selectedOrder.get_selected_orderline().set_discount(discount)
                                    }
                                }
                            }
                        }
                    }
                    if (product.sale_with_package && this.env.pos.packaging_by_product_id[product.id]) {
                        var packagings = this.env.pos.packaging_by_product_id[product.id];
                        let packList = packagings.map((p) => ({
                            id: p.id,
                            item: p,
                            label: p.name + this.env._t(' : have Contained quantity ') + p.qty + this.env._t(' with sale price ') + this.env.pos.format_currency(p.list_price)
                        }))
                        let {confirmed, payload: packSelected} = await this.showPopup('SelectionPopup', {
                            title: this.env._t('Select sale from Packaging'),
                            list: packList
                        })
                        if (confirmed) {
                            let selectedOrder = this.env.pos.get_order();
                            let selectedLine = selectedOrder.get_selected_orderline();
                            selectedLine.packaging = packSelected;
                            selectedLine.set_quantity(packSelected.qty, 'set quantity manual via packing');
                            if (packSelected.list_price > 0) {
                                selectedLine.set_unit_price(packSelected.list_price / packSelected.qty);
                            }

                        }
                    }
                }
            }

            roundingTotalAmount() {
                let selectedOrder = this.env.pos.get_order();
                let roundingMethod = this.env.pos.payment_methods.find((p) => p.journal && p.pos_method_type == 'rounding')
                if (!selectedOrder || !roundingMethod) {
                    return this.showPopup('ErrorPopup', {
                        title: this.env._t('Warning'),
                        body: this.env._t('You active Rounding on POS Setting but your POS Payment Method missed add Payment Method Rounding'),
                    })
                }
                selectedOrder.paymentlines.models.forEach(function (p) {
                    if (p.payment_method && p.payment_method.journal && p.payment_method.pos_method_type == 'rounding') {
                        selectedOrder.remove_paymentline(p)
                    }
                })
                let due = selectedOrder.get_due();
                let amountRound = 0;
                if (this.env.pos.config.rounding_type == 'rounding_integer') {
                    let decimal_amount = due - Math.floor(due);
                    if (decimal_amount <= 0.25) {
                        amountRound = -decimal_amount
                    } else if (decimal_amount > 0.25 && decimal_amount < 0.75) {
                        amountRound = 1 - decimal_amount - 0.5;
                        amountRound = 0.5 - decimal_amount;
                    } else if (decimal_amount >= 0.75) {
                        amountRound = 1 - decimal_amount
                    }
                } else {
                    let after_round = Math.round(due * Math.pow(10, roundingMethod.journal.decimal_rounding)) / Math.pow(10, roundingMethod.journal.decimal_rounding);
                    amountRound = after_round - due;
                }
                if (amountRound == 0) {
                    return true;
                }
                selectedOrder.add_paymentline(roundingMethod);
                let roundedPaymentLine = selectedOrder.selected_paymentline;
                roundedPaymentLine.set_amount(-amountRound);
            }
        }
    Registries.Component.extend(ProductScreen, RetailProductScreen);

    return ProductScreen;
});
