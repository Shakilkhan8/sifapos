odoo.define('pos_retail.PosOrderLines', function(require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');

    class PosOrderLines extends PosComponent {
        get highlight() {
            return this.props.order !== this.props.selectedOrder ? '' : 'highlight';
        }
        get OrderLines() {
            var order = this.props.order
            var lines = this.env.pos.db.lines_by_order_id[order['id']];
            return lines
        }
    }
    PosOrderLines.template = 'PosOrderLines';

    Registries.Component.add(PosOrderLines);

    return PosOrderLines;
});
