odoo.define('pos_retail.FloorScreen', function (require) {
    'use strict';

    const FloorScreen = require('pos_restaurant.FloorScreen');
    const Registries = require('point_of_sale.Registries');
    const {posbus} = require('point_of_sale.utils');

    const RetailFloorScreen = (FloorScreen) =>
        class extends FloorScreen {
            constructor() {
                super(...arguments);
            }

            mounted() {
                super.mounted();
                posbus.on('refresh:FloorScreen', this, this.render);

            }

            // willUnmount() {
            //     super.willUnmount();
            // }

            async _tableLongpolling() {
                if (this.env.pos.config.sync_multi_session) {
                    return true
                } else {
                    super._tableLongpolling()
                }
            }
        }
    Registries.Component.extend(FloorScreen, RetailFloorScreen);

    return RetailFloorScreen;
});
