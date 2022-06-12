odoo.define('pos_retail.ClientListScreen', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ClientListScreen = require('point_of_sale.ClientListScreen');
    const {useState} = owl.hooks;
    const {useListener} = require('web.custom_hooks');
    const models = require('point_of_sale.models');
    const Registries = require('point_of_sale.Registries');
    const {posbus} = require('point_of_sale.utils');
    var BarcodeEvents = require('barcodes.BarcodeEvents').BarcodeEvents;

    const RetailClientListScreen = (ClientListScreen) =>
        class extends ClientListScreen {
            constructor() {
                super(...arguments);
                this.buffered_key_events = [];
                this._onKeypadKeyDown = this._onKeypadKeyDown.bind(this);
                useListener('show-popup', this.removeEventKeyboad);
            }

            mounted() {
                super.mounted();
                this.env.pos.on('reload.client_screen', this.reload_client_screen, this);
                posbus.on('closed-popup', this, this.addEventKeyboad);
                this.addEventKeyboad()
            }

            willUnmount() {
                super.willUnmount();
                this.env.pos.off('reload:client_screen', null, this);
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
                    // -------------------------- product screen -------------
                    let key = '';
                    if (event.keyCode == 13) { // enter
                        const query = $('.searchbox-client >input').val();
                        const partners = this.env.pos.db.search_partner(query)
                        if (partners.length == 1) {
                            $(this.el).find('.searchbox-client >input').blur()
                            $(this.el).find('.searchbox-client >input')[0].value = "";
                            this.props.resolve({ confirmed: true, payload: partners[0] });
                            this.trigger('close-temp-screen');
                        }
                        $(this.el).find('.save').click()
                        $(this.el).find('.next').click()
                    }
                    if (event.keyCode == 27) { // esc
                        $(this.el).find('.searchbox-client >input').blur()
                        $(this.el).find('.searchbox-client >input')[0].value = "";
                    }
                    if (event.keyCode == 66) { // b
                        $(this.el).find('.back').click()
                    }
                    if (event.keyCode == 69) { // b
                        $(this.el).find('.edit-client-button').click()
                    }
                    if (event.keyCode == 83) { // s
                        $(this.el).find('.searchbox-client >input').focus()
                    }
                }
                this.buffered_key_events = [];
            }

            reload_client_screen(partner_datas) {
                this.render()
            }

            async saveChanges(event) {
                let self = this;
                let fields = event.detail.processedChanges;
                if (fields.phone && fields.phone != "" && this.env.pos.config.check_duplicate_phone) {
                    let partners = await this.rpc({
                        model: 'res.partner',
                        method: 'search_read',
                        domain: [['id', '!=', fields.id], '|', ['phone', '=', fields.phone], ['mobile', '=', fields.phone]],
                        fields: ['id'],
                    }).then(function (count) {
                        return count
                    }, function (err) {
                        return self.env.pos.query_backend_fail(err);
                    })
                    if (partners.length) {
                        return this.showPopup('ErrorPopup', {
                            title: this.env._t('Error'),
                            body: fields.phone + this.env._t(' already used by another customer')
                        })
                    }
                }
                if (fields.mobile && fields.mobile != "" && this.env.pos.config.check_duplicate_phone) {
                    let partners = await this.rpc({
                        model: 'res.partner',
                        method: 'search_read',
                        domain: [['id', '!=', fields.id], '|', ['phone', '=', fields.mobile], ['mobile', '=', fields.mobile]],
                        fields: ['id']
                    }).then(function (count) {
                        return count
                    }, function (err) {
                        return self.env.pos.query_backend_fail(err);
                    })
                    if (partners.length) {
                        return this.showPopup('ErrorPopup', {
                            title: this.env._t('Error'),
                            body: fields.mobile + this.env._t(' already used by another customer')
                        })
                    }
                }
                if (fields.email && fields.email != "" && this.env.pos.config.check_duplicate_email) {
                    let partners = await this.rpc({
                        model: 'res.partner',
                        method: 'search_read',
                        domain: [['id', '!=', fields.id], ['email', '=', fields.email]],
                        fields: ['id']
                    }).then(function (count) {
                        return count
                    }, function (err) {
                        return self.env.pos.query_backend_fail(err);
                    })
                    if (partners.length) {
                        return this.showPopup('ErrorPopup', {
                            title: this.env._t('Error'),
                            body: fields.email + this.env._t(' already used by another customer')
                        })
                    }
                }
                return super.saveChanges(event)
            }

            activateEditMode(event) {
                if (!this.env.pos.config.add_client) {
                    return this.showPopup('ErrorPopup', {
                        title: this.env._t('Error'),
                        body: this.env._t('You have not permission create new Customer !')
                    })
                }
                return super.activateEditMode(event)
            }
        }
    Registries.Component.extend(ClientListScreen, RetailClientListScreen);

    return ClientListScreen;
});
