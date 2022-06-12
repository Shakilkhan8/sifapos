odoo.define('pos_retail.TicketScreen', function (require) {
    'use strict';
    const TicketScreen = require('point_of_sale.TicketScreen');
    const Registries = require('point_of_sale.Registries');
    const {useListener} = require('web.custom_hooks');
    const {posbus} = require('point_of_sale.utils');
    var BarcodeEvents = require('barcodes.BarcodeEvents').BarcodeEvents;

    const RetailTicketScreen = (TicketScreen) =>
        class extends TicketScreen {
            constructor() {
                super(...arguments);
                this.buffered_key_events = []
                this._onKeypadKeyDown = this._onKeypadKeyDown.bind(this);
                useListener('show-popup', this.removeEventKeyboad);
            }

            mounted() {
                super.mounted()
                posbus.on('closed-popup', this, this.addEventKeyboad);
                this.addEventKeyboad()
            }

            willUnmount() {
                super.willUnmount()
                posbus.off('closed-popup', this, null);
                this.removeEventKeyboad()
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
                if (ev.keyCode == 27) {  // esc key
                    this.buffered_key_events.push(ev);
                    this.timeout = setTimeout(_.bind(this._keyboardHandler, this), BarcodeEvents.max_time_between_keys_in_ms);
                }
            }

            _keyboardHandler() {
                if (this.buffered_key_events.length > 2) {
                    this.buffered_key_events = [];
                    return true;
                }
                for (let i = 0; i < this.buffered_key_events.length; i++) {
                    let event = this.buffered_key_events[i]
                    console.log(event.keyCode)
                    if (event.keyCode == 27) { // esc
                        $(this.el).find('.search >input').blur()
                        $(this.el).find('.search >input')[0].value = "";
                    }
                    if (event.keyCode == 46) { // del
                        let selectedOrder = this.env.pos.get_order();
                        this.deleteOrder(selectedOrder)
                    }
                    if (event.keyCode == 66) { // b
                        $(this.el).find('.discard').click()
                    }
                    if (event.keyCode == 70) { // f
                        $(this.el).find('.filter').click()
                    }
                    if (event.keyCode == 78) { // n
                        this.createNewOrder()
                    }
                    if (event.keyCode == 83) { // s
                        $(this.el).find('.search >input').focus()
                    }
                }
                this.buffered_key_events = [];
            }

            getTable(order) {
                if (order.table) {
                    return super.getTable(order)
                } else {
                    return 'N/A'
                }
            }

            async createNewOrder() {
                if (this.env.pos.config.validate_new_order) {
                    let validate = await this.env.pos._validate_action(this.env._t('Need approve create new Order'));
                    if (!validate) {
                        return false;
                    }
                }
                return super.createNewOrder()
            }

            async removeAllOrders() {
                var orders = this.env.pos.get('orders').models;
                for (var i = 0; i < orders.length; i++) {
                    orders[i].destroy({'reason': 'abandon'})
                }
            }

            async deleteOrder(order) {
                if (this.env.pos.config.validate_remove_order) {
                    let validate = await this.env.pos._validate_action(this.env._t('Need approve delete Order'));
                    if (!validate) {
                        return false;
                    }
                }
                return super.deleteOrder(order);
            }
        }
    Registries.Component.extend(TicketScreen, RetailTicketScreen);

    return RetailTicketScreen;
});
