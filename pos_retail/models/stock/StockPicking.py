# -*- coding: utf-8 -*-
from odoo import fields, api, models

import logging

_logger = logging.getLogger(__name__)


class stock_picking(models.Model):
    _inherit = "stock.picking"

    is_picking_combo = fields.Boolean('Is Picking Combo')
    pos_order_id = fields.Many2one('pos.order', 'POS order')
    pos_branch_id = fields.Many2one('pos.branch', string='Branch')

    @api.model
    def _create_picking_from_pos_order_lines(self, location_dest_id, lines, picking_type, partner=False):
        if len(lines) >= 1:
            order_picking_type = lines[0].order_id.picking_type_id
            if picking_type and order_picking_type and order_picking_type.id != picking_type.id:
                picking_type = order_picking_type
        pickings = super(stock_picking, self)._create_picking_from_pos_order_lines(location_dest_id, lines, picking_type, partner=partner)
        return pickings

    @api.model
    def create(self, vals):
        PosOrder = self.env['pos.order'].sudo()
        if vals.get('pos_order_id', None):
            order = PosOrder.browse(vals.get('pos_order_id'))
            if order.config_id and order.config_id.pos_branch_id:
                vals.update({'pos_branch_id': order.config_id.pos_branch_id.id})
        if not vals.get('pos_branch_id'):
            vals.update({'pos_branch_id': self.env['pos.branch'].sudo().get_default_branch()})
        picking = super(stock_picking, self).create(vals)
        if picking.sale_id:
            self.env['pos.cache.database'].insert_data('sale.order', picking.sale_id.id)
        return picking

    def write(self, vals):
        PosOrder = self.env['pos.order'].sudo()
        if vals.get('pos_order_id', None):
            order = PosOrder.browse(vals.get('pos_order_id'))
            if order.config_id and order.config_id.pos_branch_id:
                vals.update({'pos_branch_id': order.config_id.pos_branch_id.id})
        datas = super(stock_picking, self).write(vals)
        for picking in self:
            if picking.sale_id:
                self.env['pos.cache.database'].insert_data('sale.order', picking.sale_id.id)
        return datas

    @api.model
    def pos_made_internal_transfer(self, picking_vals, move_lines):
        MoveObj = self.env['stock.move'].sudo()
        MoveLineObj = self.env['stock.move.line'].sudo()
        internal_transfer = self.create(picking_vals)
        for move_val in move_lines:
            pack_lots = move_val['pack_lots']
            del move_val['pack_lots']
            move_val.update({
                'picking_id': internal_transfer.id,
            })
            move = MoveObj.create(move_val)
            lot = None
            if len(pack_lots) > 0:
                lot = self.env['stock.production.lot'].search([
                    ('name', '=', pack_lots[0]['lot_name'])
                ], limit=1)
            moveLineVal = {
                'picking_id': internal_transfer.id,
                'move_id': move.id,
                'product_id': move_val.get('product_id'),
                'qty_done': move_val.get('product_uom_qty'),
                'product_uom_id': move_val.get('product_uom'),
                'location_id': move_val.get('location_id'),
                'location_dest_id': move_val.get('location_dest_id'),
            }
            if lot:
                moveLineVal.update({
                    'lot_name': pack_lots[0]['lot_name'] if len(pack_lots) > 0 else None,
                    'lot_id': lot.id if lot else None
                })
            MoveLineObj.create(moveLineVal)
        error = None
        try:
            internal_transfer.action_confirm()
            internal_transfer.button_validate()
        except Exception as ex:
            _logger.error(ex)
            error = ex
        return {
            'id': internal_transfer.id,
            'internal_ref': internal_transfer.name,
            'error': error
        }

    def _prepare_stock_move_vals(self, first_line, order_lines):
        values = super(stock_picking, self)._prepare_stock_move_vals(first_line, order_lines)
        if first_line.uom_id:
            values.update({
                'product_uom': first_line.uom_id.id
            })
        return values
