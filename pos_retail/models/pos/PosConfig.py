# -*- coding: utf-8 -*-
from odoo import api, fields, models, _
import logging
from odoo.exceptions import UserError, ValidationError
import odoo
import json


try:
    to_unicode = unicode
except NameError:
    to_unicode = str

_logger = logging.getLogger(__name__)



class PosConfig(models.Model):
    _inherit = "pos.config"

    def init(self):
        self.env.cr.execute(
            """DELETE FROM ir_model_data WHERE model IN ('pos.bus', 'pos.bus.log', 'pos.tracking.client')""");

    def set_pricelists_to_pos_sessions_online_without_reload(self):
        for config in self:
            if config.pricelist_id:
                config.pricelist_id.sync_pricelists_all_pos_online()
                break
            else:
                raise UserError('Please active pricelist and set pricelist default')
        return True

    def _get_product_field_char(self):
        product_fields = self.env['ir.model.fields'].search(
            [('model', '=', 'product.product'),
             ('ttype', '=', 'char')])
        return [
            (field.name, field.field_description)
            for field in sorted(product_fields, key=lambda f: f.field_description)
        ]

    def _get_customer_field_char(self):
        product_fields = self.env['ir.model.fields'].search(
            [('model', '=', 'res.partner'),
             ('ttype', '=', 'char')])
        return [
            (field.name, field.field_description)
            for field in sorted(product_fields, key=lambda f: f.field_description)
        ]

    def _get_picking_field_char(self):
        picking_fields = self.env['ir.model.fields'].search(
            [('model', '=', 'stock.picking'),
             ('ttype', '=', 'char')])
        return [
            (field.name, field.field_description)
            for field in sorted(picking_fields, key=lambda f: f.field_description)
        ]

    def _get_invoice_field_char(self):
        invoice_fields = self.env['ir.model.fields'].search(
            [('model', '=', 'account.move'),
             ('ttype', '=', 'char')])
        return [
            (field.name, field.field_description)
            for field in sorted(invoice_fields, key=lambda f: f.field_description)
        ]

    printer_id = fields.Many2one(
        'pos.epson',
        'Printer Network',
        help='If you choice printer here \n'
             'Receipt Invoice willl printing directly to this printer IP'
    )
    floor_ids = fields.Many2many(
        'restaurant.floor',
        'pos_config_restaurant_floor_rel',
        'pos_config_id',
        'floor_id',
        string="Floors",
        domain=[('id', '!=', None)]
    )
    user_id = fields.Many2one('res.users', 'Assigned to')
    allow_numpad = fields.Boolean('Allow Use Numpad', default=1)
    allow_discount = fields.Boolean('Allow Change Discount', default=1)
    allow_qty = fields.Boolean('Allow Change Quantity', default=1)
    allow_price = fields.Boolean('Allow Change Price', default=1)
    allow_remove_line = fields.Boolean('Allow Remove Line', default=1)
    allow_minus = fields.Boolean('Allow Minus (+/-)', default=1)
    allow_payment = fields.Boolean('Allow Payment', default=1)
    allow_customer = fields.Boolean('Allow set Customer', default=1)
    allow_add_order = fields.Boolean('Allow Add Order', default=1)
    allow_remove_order = fields.Boolean('Allow Remove Order', default=1)
    allow_add_product = fields.Boolean('Allow Add Product', default=1)
    allow_payment_zero = fields.Boolean(
        'Allow Payment Zero',
        default=1,
        help='If active, cashier can made order total amount smaller than or equal 0')
    allow_offline_mode = fields.Boolean(
        'Allow Offline Mode',
        default=1,
        help='Required Internet of Cashiers Counter Devlice used POS Session online \n'
             'If have problem internet of Cashier Counter, POS not allow submit Orders to Backend \n'
             'Example Case Problem: \n'
             '1) Intenet Offline , Cashiers submit orders to Odoo server and not success \n'
             '2) And then them clear cache browse , and orders save on Cache of Browse removed \n'
             '- It mean all orders will lost \n'
             'So this function active, when any Orders submit to backend, POS auto check Odoo server online or not. If online allow Validate Order'
    )
    display_point_receipt = fields.Boolean(
        'Display Point / Receipt', help='Active this field for display loyalty\n'
                                        ' point plus on bill receipt')
    pos_loyalty_id = fields.Many2one(
        'pos.loyalty', 'Loyalty',
        domain=[('state', '=', 'running')])
    loyalty_combine_promotion = fields.Boolean(
        'Loyalty Combine Promotion',
        help='If checked: allow each order line, loyalty plus point and promotion apply together \n'
             'If not checked: When promotion add to order lines, points will not plus'
    )
    promotion_manual_select = fields.Boolean(
        'Promotion manual Choice', default=0,
        help='When you check to this checkbox, \n'
             'your cashiers will have one button, \n'
             'when cashiers clicked on it, \n'
             'all promotions active will display for choose')
    promotion_auto_add = fields.Boolean(
        'Promotion auto Apply',
        help='When you check it,\n'
             'when your cashiers click payment button,\n'
             'all promotions active auto add to order cart')

    create_purchase_order = fields.Boolean('Create PO', default=0)
    create_purchase_order_required_signature = fields.Boolean(
        'PO Required Signature', default=0)
    purchase_order_state = fields.Selection([
        ('confirm_order', 'Auto Confirm'),
        ('confirm_picking', 'Auto Delivery'),
    ], 'Purchaser Order Auto',
        help='This is state of purchase order will process to',
        default='confirm_order')
    sale_order = fields.Boolean('Create Sale Order', default=0)
    sale_order_auto_confirm = fields.Boolean('Auto Confirm', default=0)
    sale_order_auto_invoice = fields.Boolean('Auto Paid', default=0)
    sale_order_auto_delivery = fields.Boolean('Auto Delivery', default=0)
    sale_order_required_signature = fields.Boolean(
        'SO Required Signature',
        help='Allow print receipt when create quotation/order')

    pos_orders_management = fields.Boolean(
        'POS Order Management',
        default=0)
    shipping_order = fields.Boolean(
        'Shipping Order',
        default=1,
        help='Create Customer Order Delivery (COD) \n'
             'Allow cashiers create shipping address and save to Order, do partial payment Order \n'
             'When Delivery Man success shipping Order, Cashier confirm Order to Paid \n'
             'If you active this future, please active Partial Payment too\n'
             'For cashier add one part payment of Customer'
    )
    paid_partial = fields.Boolean(
        'Allow Partial Payment', default=1,
        help='Allow cashiers payment one part of Total Amount Order')
    load_orders_type = fields.Selection([
        ('last_7_days', 'Last 7 Days'),
        ('last_1_month', 'Last 30 Month'),
        ('last_1_year', 'Last 1 Year (365 days)'),
        ('load_all', 'Load All'),
    ],
        default='last_7_days',
        string='Period days loading Orders'
    )
    pos_orders_filter_by_branch = fields.Boolean(
        'POS Order Filter Branch', default=0,
        help='If you checked it, \n'
             'pos session could not see orders of another branch')
    pos_order_period_return_days = fields.Float(
        'Return Period Days',
        help='This is period days allow customer \n'
             'can return Order or one part of Order',
        default=30)
    required_reason_return = fields.Boolean(
        'Required Reason Return',
        help='Required Cashiers input Reason Return each line if Order is return'
    )
    display_return_days_receipt = fields.Boolean('Display Return Days on Receipt', default=0)
    display_onhand = fields.Boolean(
        'Show Stock on Hand each Product', default=1,
        help='Display quantity on hand all products on pos screen')
    allow_order_out_of_stock = fields.Boolean(
        'Allow Sale when Product Out Of Stock',
        default=1)
    print_voucher = fields.Boolean(
        'Create Voucher',
        help='Allow cashiers create Voucher Manual on POS',
        default=0)
    voucher_sequence_id = fields.Many2one('ir.sequence', 'Voucher Sequence')
    expired_days_voucher = fields.Integer(
        'Expired days of Voucher',
        default=30,
        help='Total days keep voucher can use, \n'
             'if out of period days from create date, voucher will expired')
    sync_multi_session = fields.Boolean('Sync between Sessions', default=0)
    sync_multi_session_with = fields.Char('Sync with', compute='_get_sync_with_sessions')
    sync_multi_session_manual_stop = fields.Boolean('Sync Can manual stop by Users')
    sync_multi_session_alert_remove_order = fields.Boolean('Popup Alert when another Sessions Remove Orders')
    sync_to_pos_config_ids = fields.Many2many(
        'pos.config',
        'sync_session_rel',
        'from_id',
        'to_id',
        string='Sync with POS Configs',
        domain="['|', ('pos_branch_id', '=', pos_branch_id), ('pos_branch_id', '=', None)]",
        help='Any events changes from this pos config will sync direct \n' \
             'to this pos configs selected here'
    )
    sync_manual_button = fields.Boolean(
        'Sync Manual Order',
        help='Allow POS Session of This Config send Orders to another Sessions direct \n'
             'If another Sessions have the same Order with current Sessions \n'
             'Orders of another Sessions will replace by Orders send from current Session')
    sync_multi_session_offline = fields.Boolean(
        'Sync Between Session with Local Network',
        default=0,
        help='If not checked, normal sync between Sessions required Odoo Server Online \n'
             'If checked, we dont care Odoo offline or not \n'
             'All sync datas will sync direct POS/IOT Box'
    )
    sync_multi_session_offline_iot_ids = fields.Many2many(
        'pos.iot', 'pos_config_iot_rel', 'pos_config_id',
        'iot_box_id',
        string='IoT Boxes',
        help='Setup 1 pos/iot box \n'
             'And use it for Sync Point inside Your Shop/Restaurant Local Network \n'
             'This function only for our partnership \n'
             'If you need it, please go to our website: http://posodoo.com \n'
             'And looking to Professional Plan')
    sync_tracking_activities_user = fields.Boolean(
        'Tracking Activities User',
        default=1,
        help='Tracking all activities of POS User \n'
             'Example: add new product, remove line ....'
    )
    display_person_add_line = fields.Boolean('Display information Lines', default=0,
                                             help="When you checked, on pos order lines screen, \n"
                                                  "will display information person created order \n"
                                                  "(lines) Eg: create date, updated date ..")
    internal_transfer = fields.Boolean('Allow Internal Transfer', default=0,
                                       help='Go Inventory and active multi warehouse and location')

    discount = fields.Boolean('Active Global Discounts', default=0)
    discount_ids = fields.Many2many(
        'pos.global.discount',
        'config_discount_rel',
        'config_id',
        'discount_id',
        string='Global Discount Items'
    )
    delay = fields.Integer('Delay time', default=3000)


    discount_limit = fields.Boolean('Discount Limit', default=0)
    discount_limit_amount = fields.Float(
        'Discount Limit (%)',
        help='This is maximum disc (%) cashier can set to each line',
        default=0)
    return_products = fields.Boolean('Return Products or Orders',
                                     help='Allow cashier return products or orders',
                                     default=0)
    return_method_id = fields.Many2one(
        'pos.payment.method',
        'Return Method'
    )
    return_duplicate = fields.Boolean(
        'Allow duplicate Return Order',
        help='If checked, one Order can return many times'
    )
    return_viva_scan_barcode = fields.Boolean(
        'Scan Barcode auto Return Order',
        default=1,
    )

    validate_payment = fields.Boolean('Validate Payment')
    validate_remove_order = fields.Boolean('Validate Remove Order')
    validate_new_order = fields.Boolean('Validate New Order')
    validate_change_minus = fields.Boolean('Validate Pressed +/-')
    validate_quantity_change = fields.Boolean('Validate Quantity Change')
    validate_price_change = fields.Boolean('Validate Price Change')
    validate_discount_change = fields.Boolean('Validate Discount Change')
    validate_remove_line = fields.Boolean('Validate Remove Line')
    validate_return = fields.Boolean('Validate Return')

    product_operation = fields.Boolean(
        'Product Operation', default=0,
        help='Allow cashiers add pos categories and products on pos screen')
    quickly_payment_full = fields.Boolean('Quickly Paid Full')
    note_order = fields.Boolean('Note Order', default=0)
    signature_order = fields.Boolean('Signature Order', default=0)

    booking_orders = fields.Boolean(
        'Booking Orders',
        default=0,
        help='Orders may be come from many sources locations\n'
             'Example: Web E-Commerce, Call center, or phone call order\n'
             'And your Cashiers will made Booking Orders and save it\n'
             'Your Shipper or customer come shop will delivery Orders')
    load_booked_orders_type = fields.Selection([
        ('last_7_days', 'Last 7 Days'),
        ('last_1_month', 'Last 30 Month'),
        ('last_1_year', 'Last 1 Year (365 days)'),
        ('load_all', 'Load All'),
    ],
        default='last_7_days',
        string='Period days loading Booked Orders'
    )
    booking_orders_alert = fields.Boolean(
        'Alert Order Coming', default=0,
        help='When have any Booking Order come from another Source Location to POS\n'
             'POS will Alert one popup inform your cashier have new Order coming')
    booking_allow_confirm_sale = fields.Boolean(
        'Delivery Booked Orders', default=0,
        help='Allow Cashier can Confirm Booked Orders and create Delivery Order')
    booking_orders_display_shipping_receipt = fields.Boolean('Shipping Address Receipt', default=0)
    display_tax_orderline = fields.Boolean('Display Taxes Order Line', default=0)
    display_tax_receipt = fields.Boolean('Display Taxes Receipt', default=0)
    display_image_orderline = fields.Boolean('Display Image on Order Lines', default=0)
    display_image_receipt = fields.Boolean('Display Image on Receipt', default=0)
    display_amount_discount = fields.Boolean('Display Amount Discount', default=1)
    category_wise_receipt = fields.Boolean(
        'Category Wise Receipt',
        default=0,
        help='Bill will wise each POS Category')
    management_invoice = fields.Boolean('Display Invoices Screen', default=0)
    load_invoices_type = fields.Selection([
        ('last_7_days', 'Last 7 Days'),
        ('last_1_month', 'Last 1 Month (30 days)'),
        ('last_1_year', 'Last 1 Year (365 days)'),
        ('load_all', 'Load All'),
    ],
        default='last_7_days',
        string='Period days loading Invoices'
    )
    invoice_offline = fields.Boolean(
        'Invoice Offline Mode',
        help='Any Orders come from POS Session always create invoice \n'
             'Invoice will create few second after POS Orders created \n'
             'This future not print invoice number on POS Receipt \n'
             'Only create invoice each order and auto post invoice when POS Order submitted to backend \n'
             'Please set Customer Default or all orders on POS required set Customer before do payment'
    )
    wallet = fields.Boolean(
        'Wallet Card',
        help='Keeping all change money back to Customer Wallet Card\n'
             'Example: customer bought products with total amount is 9.5 USD\n'
             'Customer give your Cashier 10 USD, \n'
             'Default your cashier will return back change money 0.5 USD\n'
             'But Customer no want keep it, \n'
             'They need change money including to Wallet Card for next order\n'
             'Next Time customer come back, \n'
             'When your cashier choice client have Wallet Credit Amount bigger than 0\n'
             'Customer will have one more payment method via Wallet Credit')
    payment_journal_ids = fields.Many2many(
        'account.journal',
        'pos_config_invoice_journal_rel',
        'config_id',
        'journal_id',
        'Save Invoice Journal with this Journal',
        domain=[('type', '=', 'sale')],
        help="Default POS Odoo save Invoice Journal from only one Invoicing Journal of POS Config\n"
             "This future allow you add many Journals here\n"
             "And when your cashier choice Journal on POS\n"
             "Journal of Invoice will the same Journal selected by cashier")
    send_invoice_email = fields.Boolean(
        'Send email invoice',
        help='Help cashier send invoice to email of customer',
        default=0)
    auto_invoice = fields.Boolean(
        'Auto create Invoice',
        help='Auto check to button Invoice on POS Payment Screen',
        default=0)
    invoice_without_download = fields.Boolean(
        'Order to Invoice without Download',
        help='When cashier choose Invoice on Payment Screen \n'
             'POS will automatic made invoice for Order \n'
             'And blocked download Invoice Receipt Pdf'
    )
    receipt_customer_vat = fields.Boolean(
        'Add Customer Vat on Receipt',
        help='Show customer VAT(TIN) on receipt header', default=0)
    fiscal_position_auto_detect = fields.Boolean(
        'Fiscal position auto detect',
        default=0
    )
    display_sale_price_within_tax = fields.Boolean(
        'Display Sale Price Within Taxes',
        default=1
    )
    display_cost_price = fields.Boolean('Display Cost Price', default=0)
    display_product_ref = fields.Boolean('Display Product Ref', default=0)
    display_product_second_name = fields.Boolean(
        'Display Product Second Name',
        default=1,
        help='If you need show Product Second Name on product record \n'
             'Active it for display second name on order cart and receipt/bill'
    )
    hide_product_image = fields.Boolean('Hide Product Image', default=0)
    multi_location = fields.Boolean('Update Stock each Location', default=0)
    update_stock_onhand = fields.Boolean('Allow Update Stock On Hand', default=0)
    multi_stock_operation_type = fields.Boolean('Multi Stock Operation Type')
    multi_stock_operation_type_ids = fields.Many2many(
        'stock.picking.type',
        'config_stock_picking_type_rel',
        'config_id',
        'stock_picking_type_id',
        string='Operation Types',
        domain="[('warehouse_id.company_id', '=', company_id)]"
    )
    update_stock_onhand_realtime = fields.Boolean(
        'Update Stock Realtime',
        help='POS screen automatic refresh stock on hand all products type is consu each 3 seconds \n'
    )
    product_view = fields.Selection([
        ('box', 'Box View'),
        ('list', 'List View'),
    ], default='box', string='Product Screen View Type', required=1)
    product_image_size = fields.Selection([
        ('default', 'Default'),
        ('small', 'Small'),
        ('big', 'Big')
    ],
        default='big',
        string='Product Image Size')
    customer_default_id = fields.Many2one('res.partner', 'Customer Default', help='When you put customer here, \n'
                                                                                  'when cashier create new order, pos auto add this customer to order for default')
    set_guest = fields.Boolean('Set Guests', default=0)
    set_guest_when_add_new_order = fields.Boolean(
        'Auto Ask Guests',
        help='When Cashiers add Orders, pos auto popup and ask guest name and guest number')
    update_tax = fields.Boolean(
        'Modify Taxes of Lines',
        default=0,
        help='Allow Cashiers can change Taxes of Lines')
    update_tax_ids = fields.Many2many(
        'account.tax',
        'pos_config_tax_rel',
        'config_id',
        'tax_id', string='List Taxes')
    review_receipt_before_paid = fields.Boolean(
        'Print Receipt Before Payment',
        help='Allow Print Receipt without Payment',
        default=1)
    print_last_order = fields.Boolean(
        'Print Last Receipt',
        default=0,
        help='Allow cashiers print last receipt')
    check_duplicate_email = fields.Boolean('Check duplicate email', default=0)
    check_duplicate_phone = fields.Boolean('Check duplicate phone', default=0)
    add_sale_person = fields.Boolean('Add Sale Person', default=0)
    default_seller_id = fields.Many2one(
        'res.users',
        'Default Seller',
        help='This is Seller automatic assigned to new Orders and new Order Lines'
    )
    seller_ids = fields.Many2many(
        'res.users',
        'pos_config_sellers_rel',
        'config_id',
        'user_id',
        string='Sellers',
        help='This is list sellers use for choice and add to Order or Order Line')
    force_seller = fields.Boolean(
        'Force Seller',
        help='When Your POS session select/change another Seller \n'
             'POS auto assigned New Seller to each Line of Order Cart',
        default=0)
    logo = fields.Binary('Receipt Logo')
    payment_coin = fields.Boolean('Payment Coin')
    payment_coin_ids = fields.Many2many('pos.quickly.payment', string='Coins')
    backup_orders = fields.Text('Backup Orders', readonly=1)
    backup_orders_automatic = fields.Boolean(
        'Automatic BackUp Orders',
        help='Schedule 5 seconds, POS Session automatic backup Orders to BackEnd Odoo \n'
             'If POS Sessions Screen crashed, Computer PC Crashed or Browse Crashed ... could not open POS back \n'
             'Them can change to another PC, Devices and Open POS Session back \n'
             'Last Orders not Paid will automatic restore \n'
             'Nothing Unpaid Orders lost on POS Session \n'
             'Only Case will lost UnPaid Orders: POS Users turnoff Internet and them Remove Cache of Browse (**)\n'
             'With (**), we have not solution for covert It. Required Input Orders Unpaid Manual back'
    )
    management_session = fields.Boolean(
        'Management Cash Control',
        default=0,
        help='Allow pos users can take money in/out session\n'
             'If you active this future please active Cash Control of POS Odoo Original too'
    )
    cash_inout_reason_ids = fields.Many2many(
        'product.product',
        'pos_config_cash_inout_product_rel',
        'config_id',
        'product_id',
        sting='Cash In/Out Reason')
    barcode_receipt = fields.Boolean('Display Barcode Receipt', default=0)
    print_delivery_report = fields.Boolean(
        'Print Delivery Report',
        default=0,
        help='If you active it \n'
             'When Cashiers print POS Bill, POS auto print PDF Delivery Order Report'
    )
    print_order_report = fields.Boolean('Print Order Report',
                                        default=0,
                                        help='If you active it \n'
                                             'When Cashiers print POS Bill, POS auto print PDF POS Order Report'
                                        )
    hide_mobile = fields.Boolean("Hide Client's Mobile", default=1)
    hide_phone = fields.Boolean("Hide Client's Phone", default=1)
    hide_email = fields.Boolean("Hide Client's Email", default=1)
    update_client = fields.Boolean('Allow Update Clients',
                                   default=1,
                                   help='Uncheck if you dont want cashier change customer information on pos')
    add_client = fields.Boolean(
        'Allow Add Client',
        help='Allow POS Session can create new Client')
    remove_client = fields.Boolean('Allow Remove Clients',
                                   help='Uncheck if you dont want cashier remove customers on pos')
    report_signature = fields.Boolean(string="Report Signature", default=0)

    report_product_summary = fields.Boolean(string="Report Product Summary", default=0)
    report_product_summary_auto_check_product = fields.Boolean('Auto Checked to Product Summary')
    report_product_summary_auto_check_category = fields.Boolean('Auto Checked to Product Category Summary')
    report_product_summary_auto_check_location = fields.Boolean('Auto Checked to Product Location Summary')
    report_product_summary_auto_check_payment = fields.Boolean('Auto Checked to Product Payment Summary')

    report_order_summary = fields.Boolean(string='Report Order Summary', default=0)
    report_order_summary_auto_check_order = fields.Boolean('Auto Checked to Order Summary')
    report_order_summary_auto_check_category = fields.Boolean('Auto Checked to Order Category Summary')
    report_order_summary_auto_check_payment = fields.Boolean('Auto Checked to Order Payment Summary')
    report_order_summary_default_state = fields.Selection([
        ('new', 'New'),
        ('paid', 'Paid'),
        ('posted', 'Posted'),
        ('invoiced', 'Invoiced'),
        ('all', 'All')
    ], string='Report with state', default='all')

    report_payment_summary = fields.Boolean(string="Report Payment Summary", default=0)
    report_sale_summary = fields.Boolean('Report Sale Summary (Z-Report)')
    report_sale_summary_show_profit = fields.Boolean('Report Sale Summary show Gross/Profit')
    default_product_sort_by = fields.Selection([
        ('a_z', 'Sort Name A to Z'),
        ('z_a', 'Sort Name Z to A'),
        ('low_price', 'Sort from Low to High Sale Price'),
        ('high_price', 'Sort from High to Low Sale Price'),
        ('pos_sequence', 'Product POS Sequence')
    ], string='Default Sort By', default='a_z')
    add_customer_before_products_already_in_shopping_cart = fields.Boolean(
        'Required choice Client before Add to Cart',
        help='Add customer before products \n'
             'already in shopping cart',
        default=0)
    allow_cashier_select_pricelist = fields.Boolean(
        'Allow Cashier select Pricelist',
        help='If uncheck, pricelist only work when select customer.\n'
             ' Cashiers could not manual choose pricelist',
        default=1)
    big_datas_turbo = fields.Boolean(
        'Turbo Starting Session',
        help='Starting Session faster than default x4 x5 times \n'
             'If have any modifiers, updates on backend and linked to POS, please refresh page (F5) POS session'
    )
    big_datas_sync_backend = fields.Boolean(
        'Auto Sync Realtime with Backend',
        help='Any event changes Products and Customers, POS Session Screen will update the same datas',
        default=1)
    sale_with_package = fields.Boolean(
        'Sale with Package')
    allow_set_price_smaller_min_price = fields.Boolean(
        'Allow Cashier set Price smaller than Sale Price of Product',
        default=1)
    create_lots = fields.Boolean('Allow Create Lots/Serial', help='Allow cashier create Lots/Serials on pos')
    fullfill_lots = fields.Boolean('Auto fullfill Lot', default=1)
    promotion_ids = fields.Many2many(
        'pos.promotion',
        'pos_config_promotion_rel',
        'config_id',
        'promotion_id',
        string='Promotions Applied')
    pos_branch_id = fields.Many2one('pos.branch', 'Branch')

    stock_location_ids = fields.Many2many(
        'stock.location', string='Stock Locations',
        help='Stock Locations for cashier select checking stock on hand \n'
             'and made picking source location from location selected',
        domain=[('usage', '=', 'internal')])
    validate_by_manager = fields.Boolean('Validate by Managers')
    discount_unlock_by_manager = fields.Boolean('Unlock Limit Discount by Manager')
    manager_ids = fields.Many2many('res.users', 'pos_config_res_user_manager_rel', 'config_id', 'user_id',
                                   string='Manager Validation')
    stock_location_id = fields.Many2one('stock.location', string='POS Default Source Location',
                                        related='picking_type_id.default_location_src_id',
                                        readonly=1)
    stock_location_dest_id = fields.Many2one('stock.location', string='POS Default Dest Location',
                                             related='picking_type_id.default_location_dest_id',
                                             readonly=1)
    receipt_display_subtotal = fields.Boolean('Receipt Display Sub Total', default=1)
    receipt_display_taxes = fields.Boolean('Receipt Display Taxes', default=1)
    receipt_display_warehouse = fields.Boolean('Receipt Display Warehouse', default=0)
    receipt_header_style = fields.Selection([
        ('left', 'Left'),
        ('center', 'Center'),
        ('right', 'Right')
    ],
        default='center',
        string='Header Receipt Style',
        help='Header style, this future only apply on posbox and printer connected\n'
             'Not apply for printer direct web browse'
    )
    receipt_display_unit = fields.Boolean(
        'Receipt Display Unit of Measure',
        default=1
    )
    receipt_manual_download_invoice = fields.Boolean(
        'Receipt Manual Download Invoice',
        default=1
    )
    validate_order_without_receipt = fields.Boolean(
        'Validate Order without Print Receipt',
        help='Orders pushing to backend without Print Receipt \n'
             'Allow cashier full fill payment on Payment Screen \n'
             'When it Done, click Validate for next new Order, bypass Print Receipt step',
        default=0,
    )
    discount_value = fields.Boolean('Discount Value')
    discount_value_limit = fields.Float(
        'Discount Value Limit',
        help='This is maximum Amount Discount Cashier can set to each Line'
    )
    posbox_save_orders = fields.Boolean('Save Orders on PosBox')
    posbox_save_orders_iot_ids = fields.Many2many(
        'pos.iot',
        'pos_config_iot_save_orders_rel',
        'config_id',
        'iot_id',
        string='IoT boxes'
    )
    posbox_save_orders_server_ip = fields.Char(
        'Odoo Public Ip Address',
        help='Example Ip: 192.168.100.100'
    )
    posbox_save_orders_server_port = fields.Char(
        'Odoo Public Port Number',
        default='8069',
        help='Example Port: 8069'
    )
    analytic_account_id = fields.Many2one(
        'account.analytic.account',
        'Analytic Account'
    )
    limit_categories = fields.Boolean("Restrict Available Product Categories")
    iface_available_categ_ids = fields.Many2many(
        'pos.category',
        string='Available PoS Product Categories',
        help='The point of sale will only display products \n'
             'which are within one of the selected category trees. \n'
             'If no category is specified, all available products will be shown')
    barcode_scan_with_camera = fields.Boolean(
        'Use Camera Scan Barcode',
        help='If you check it, and your device use POS have camera \n'
             'You can use camera of device scan barcode for add products, return orders ....\n'
             'This future only supported web browse and SSL \n'
             'SSL required if you are on cloud. As without SSL permission of camera not work.'
    )
    barcode_scan_timeout = fields.Float(
        'Times timeout',
        default=1000,
        help='Period times timeout for next scan\n'
             '1000 = 1 second\n'
             'I good time for scan we think 1000'
    )
    rounding_automatic = fields.Boolean('Rounding Automatic',
                                        help='When cashier go to Payment Screen, POS auto rounding')
    rounding_type = fields.Selection([
        ('rounding_by_decimal_journal', 'By Decimal Rounding of Journal'),
        ('rounding_integer', 'Rounding to Integer'),
    ],
        default='rounding_integer',
        help='By Decimal Rounding Journal: We will follow rounding of Journal Decimal Rounding Amount\n'
             'Rounding Integer: \n'
             'From decimal from 0 to 0.25 become 0\n'
             'From decimal from 0.25 to 0.75 become 0.5\n'
             'From decimal from 0.75 to 0.999 become to 1')

    service_charge_ids = fields.Many2many(
        'pos.service.charge',
        'pos_config_service_charge_rel',
        'config_id',
        'charge_id',
        string='Services Charge'
    )
    service_shipping_automatic = fields.Boolean(
        'Service Shipping Automatic',
        help='When cashier select Customer \n'
             'POS auto compute distance (km) from your Shop Stock Location to Partner Address \n'
             'And get distance for compute shipping cost, automatic add this cost to cart'
    )
    google_map_api_key = fields.Char('Google Map Api Key', invisible=True)
    payment_reference = fields.Boolean(
        'Payment Reference',
        help='Allow cashier add reference Note each payment line'
    )
    display_margin = fields.Boolean('Display Margin %')
    allow_split_table = fields.Boolean('Allow Split Table')
    allow_merge_table = fields.Boolean('Merge/Combine Tables')
    allow_lock_table = fields.Boolean(
        'Lock Table',
        default=0,
        help='If Customer Booked Table, you can lock talbe \n'
             'Unlock by Pos Pass In of Managers Validation')
    required_set_guest = fields.Boolean(
        'Auto ask Guests when add new Order')
    start_session_oneclick = fields.Boolean(
        'Start Session One Click'
    )
    translate_products_name = fields.Boolean(
        'Load Translate Products Name',
        help='When active, all products name language will load correct language of language POS User started session',
        default=0
    )
    set_product_name_from_field = fields.Selection(
        _get_product_field_char,
        default='name',
        string='Product Name display by field',
        help="Choose the field of the table Product which will be used for Product Display"
    )
    replace_partners_name = fields.Boolean(
        'Replace Partners Name',
        help='When active, partners name will replace buy field you choose bellow',
        default=0
    )
    set_partner_name_from_field = fields.Selection(
        _get_customer_field_char,
        default='name',
        string='Customer Name display from field',
        help="Choose the field of the table Customer which will be used for Customer Display"
    )
    default_display_cart = fields.Boolean(
        'Default Display Cart',
        default=0,
        help='If uncheck, default Product Screen cart list will automatic invisible'
    )
    add_order_fields_to_receipt = fields.Many2many(
        'ir.model.fields',
        'pos_config_order_ir_model_fields_rel',
        'config_id',
        'field_id',
        domain=[
            ('model', '=', 'pos.order'),
            ('ttype', 'not in', ['binary', 'one2many', 'many2many'])
        ],
        string='Order fields Display',
        help='Fields added here will display on receipt'
    )
    add_picking_field_to_receipt = fields.Selection(
        _get_picking_field_char,
        default='name',
        string='Add Picking Field to Receipt',
        help="Please choose one field of Delivery Object\n"
             "Display to your POS receipt"
    )
    add_picking_fields_to_receipt = fields.Many2many(
        'ir.model.fields',
        'pos_config_picking_ir_model_fields_rel',
        'config_id',
        'field_id',
        domain=[
            ('model', '=', 'stock.picking'),
            ('ttype', 'not in', ['binary', 'one2many', 'many2many'])
        ],
        string='Delivery fields Display',
        help='Fields added here will display on receipt'
    )
    add_invoice_field_to_receipt = fields.Selection(
        _get_invoice_field_char,
        default='name',
        string='Add Invoice Field to Receipt',
        help="Please choose one field of Invoice Object\n"
             "for Display to your POS receipt"
    )
    add_invoices_field_to_receipt = fields.Many2many(
        'ir.model.fields',
        'pos_config_invoice_ir_model_fields_rel',
        'config_id',
        'field_id',
        domain=[
            ('model', '=', 'account.move'),
            ('ttype', 'not in', ['binary', 'one2many', 'many2many'])
        ],
        string='Invoice fields Display',
        help='Fields added here will display on receipt'
    )
    create_quotation = fields.Boolean(
        'Create Quotation Order (Call Center)',
        help='Allow cashier create Quotation Order, \n'
             'If customer full fill payment order, automatic processing to paid \n'
             'Else cashier can cancel quotation direct POS screen'
    )
    assign_orders_to_config_ids = fields.Many2many(
        'pos.config',
        'pos_config_assign_orders_rel',
        'from_config_id',
        'assign_config_id',
        string='Allow Assign Orders to POS'
    )
    display_logo = fields.Boolean(
        'Display Logo',
        default=1,
        help='If you uncheck, logo will not display on POS Receipt'
    )
    product_generic_option = fields.Boolean(
        'Product Generic Option',
        help='Generic product options. \n'
             'It should be possible to define certain product options that can be applied to any product \n'
             'Example: "Whipped cream" or "Extra hot".\n'
             'Generic product options may have an additional cost and materials list. \n'
             'If you active this option, please go to Retail Operation / Product Generic Option and add datas'
    )
    allow_select_variant = fields.Boolean(
        'Select Variants and Attributes before add to Cart',
        default=1,
        help='If Product have multi Attributes and Values \n'
             'Allow cashier easy choice it before add to Cart'
    )
    mrp = fields.Boolean(
        'Manufacturing',
        help='If each POS Line, cashier select assign BOM (Bill Of Material)\n'
             'When Cashier finish input BOM each POS Line \n'
             'Manufacturing Order will create and automatic processing \n'
    )
    mrp_bom_auto_assign = fields.Boolean(
        'Auto Assign Bom',
        help='If product have only one BOM \n'
             'POS auto assign BOM to Order Line'
    )
    mrp_auto_confirm = fields.Boolean('Production Auto Confirm')
    mrp_auto_assign = fields.Boolean('Production Auto Assign')
    mrp_auto_done = fields.Boolean('Production Auto Done')
    mrp_produce_direct = fields.Boolean(
        'Create MRP Produce Direct',
        default=0,
        help='Allow Cashier create MRP Produce Direct from POS Screen'
    )
    limited_products_display = fields.Integer(
        string='Limited Products Display',
        default=20,
        help='Set number limited Products Display on POS Screen \n'
             'Example: set 10, only maximum 10 items display on POS Screen \n'
             'When cashier input search box, products will render more.'
    )
    last_save_cache = fields.Char('Last Save Cache', compute='_get_last_save_cache')
    display_sequence_number = fields.Boolean(
        'Display Sequence Number',
        default=True,
    )
    point_of_sale_update_stock_quantities = fields.Selection([
        ('closing', 'At the session closing (advised)'),
        ('real', 'In real time'),
    ],
        default='real',
        string="Update quantities in stock",
        required=1,
        help="At the session closing: A picking is created for the entire session when it's closed\n In real time: Each order sent to the server create its own picking")

    duplicate_receipt = fields.Boolean('Duplicate Receipt')
    duplicate_number = fields.Integer('Duplicate Number', default=2)

    multi_session = fields.Boolean(
        'Allow Multi Session',
        help='Each Employee will assign 1 POS Session \n'
             'Difference Employee is difference POS Session'
    )
    multi_session_login_pin = fields.Boolean(
        'Required Login via Pin of Employee'
    )
    product_category_ids = fields.Many2many(
        'product.category',
        'pos_config_product_category_rel',
        'config_id',
        'category_id',
        string='Product Categories',
    )
    sessions_opened = fields.Boolean(
        'Have Sessions Opened',
        compute='_check_has_sessions_not_closed'
    )

    create_category_direct = fields.Boolean('Create POS Category Direct')
    create_product_direct = fields.Boolean('Create Product Direct')

    def _check_has_sessions_not_closed(self):
        for config in self:
            sessions = self.env['pos.session'].sudo().search([
                ('state', '!=', 'closed'),
                ('config_id', '=', config.id)
            ])
            if sessions:
                config.sessions_opened = True
            else:
                config.sessions_opened = False

    def _get_sync_with_sessions(self):
        for config in self:
            config.sync_multi_session_with = ''
            if config.sync_multi_session:
                for c in config.sync_to_pos_config_ids:
                    config.sync_multi_session_with += c.name + ' / '

    @api.onchange('allow_numpad')
    def onchange_allow_numpad(self):
        if not self.allow_numpad:
            self.allow_discount = False
            self.allow_qty = False
            self.allow_price = False
            self.allow_remove_line = False
            self.allow_minus = False
        else:
            self.allow_discount = True
            self.allow_qty = True
            self.allow_price = True
            self.allow_remove_line = True
            self.allow_minus = True

    def _get_last_save_cache(self):
        for config in self:
            log = self.env['pos.call.log'].search([], limit=1)
            if log:
                config.last_save_cache = log.write_date
            else:
                config.last_save_cache = 'Not Install Before'

    @api.onchange('mrp')
    def onchange_mrp(self):
        if not self.mrp:
            self.mrp_bom_auto_assign = False
            self.mrp_auto_confirm = False
            self.mrp_auto_assign = False
            self.mrp_auto_done = False
            self.mrp_produce_direct = False

    @api.onchange('sync_multi_session')
    def onchange_sync_multi_session(self):
        if not self.sync_multi_session:
            self.sync_multi_session_manual_stop = False

    @api.onchange('mrp_auto_done')
    def onchange_mrp_auto_assign(self):
        if self.mrp_auto_done:
            self.mrp_auto_assign = True
            self.mrp_auto_confirm = True

    def remove_sync_between_session_logs(self):
        for config in self:
            sessions = self.env['pos.session'].search([(
                'config_id', '=', config.id
            )])
        return True

    @api.onchange('discount')
    def onchange_discount(self):
        if self.discount:
            self.discount_limit_amount = 0
            self.discount_limit = False

    @api.onchange('multi_stock_operation_type')
    def onchange_multi_stock_operation_type(self):
        if not self.multi_stock_operation_type:
            self.multi_stock_operation_type_ids = [(6, 0, [])]

    def reinstall_database(self):
        ###########################################################################################################
        # new field append :
        #                    - update param
        #                    - remove logs datas
        #                    - remove cache
        #                    - reload pos
        #                    - reinstall pos data
        # reinstall data button:
        #                    - remove all param
        #                    - pos start save param
        #                    - pos reinstall with new param
        # refresh call logs:
        #                    - get fields domain from param
        #                    - refresh data with new fields and domain
        ###########################################################################################################
        parameters = self.env['ir.config_parameter'].sudo().search([
            ('key', 'in', [
                'product.product', 'res.partner',
                'account.move', 'account.move.line',
                'pos.order', 'pos.order.line',
                'sale.order', 'sale.order.line'
            ])])
        if parameters:
            parameters.sudo().unlink()
        self.env['pos.cache.database'].search([]).unlink()
        self.env['pos.call.log'].search([]).unlink()
        sessions_opened = self.env['pos.session'].sudo().search([('state', '=', 'opened')])
        sessions_opened.write({
            'required_reinstall_cache': True
        })
        for session in sessions_opened:
            self.env['bus.bus'].sendmany(
                [[(self.env.cr.dbname, 'pos.remote_sessions', session.user_id.id), json.dumps({
                    'remove_cache': True,
                    'database': self.env.cr.dbname,
                    'session_id': session.id
                })]])
        for config in self:
            sessions = self.env['pos.session'].sudo().search(
                [('config_id', '=', config.id), ('state', '=', 'opened')])
            if not sessions:
                return {
                    'type': 'ir.actions.act_url',
                    'url': '/pos/web?config_id=%d' % config.id,
                    'target': 'self',
                }
            sessions.write({'required_reinstall_cache': True})
            config_fw = config
            self.env['pos.session'].sudo().search(
                [('config_id', '!=', config.id), ('state', '=', 'opened')]).write({'required_reinstall_cache': True})
        return {
            'type': 'ir.actions.act_url',
            'url': '/pos/web?config_id=%d' % config_fw.id,
            'target': 'self',
        }

    def remote_sessions(self):
        return {
            'name': _('Remote sessions'),
            'view_type': 'form',
            'target': 'new',
            'view_mode': 'form',
            'res_model': 'pos.remote.session',
            'view_id': False,
            'type': 'ir.actions.act_window',
            'context': {},
        }

    def validate_and_post_entries_session(self):
        for config in self:
            sessions = self.env['pos.session'].search([
                ('config_id', '=', config.id),
                ('state', '!=', 'closed'),
                ('rescue', '=', False)
            ])
            if sessions:
                sessions.close_session_and_validate()
                for session in sessions:
                    vals = {
                        'validate_and_post_entries': True,
                        'session_id': session.id,
                        'config_id': session.config_id.id,
                        'database': self.env.cr.dbname
                    }
                    self.env['bus.bus'].sendmany(
                        [[(self.env.cr.dbname, 'pos.remote_sessions', session.user_id.id), json.dumps(vals)]])
            else:
                raise UserError(_('Warning, all sessions has closed'))
        return True

    def write(self, vals):
        if vals.get('allow_discount', False) or vals.get('allow_qty', False) or vals.get('allow_price', False):
            vals['allow_numpad'] = True
        if vals.get('expired_days_voucher', None) and vals.get('expired_days_voucher') < 0:
            raise UserError('Expired days of voucher could not smaller than 0')
            if config.pos_order_period_return_days <= 0:
                raise UserError('Period days return orders and products required bigger than or equal 0 day')
        res = super(PosConfig, self).write(vals)
        for config in self:
            if vals.get('management_session', False) and not vals.get('default_cashbox_id'):
                if not config.default_cashbox_id and not config.cash_control:
                    raise UserError(
                        'Your POS config missed config Default Opening (Cash Control), Please go to Cash control and set Default Opening')
        if vals.get('google_map_api_key', None):
            self.env['ir.config_parameter'].sudo().set_param('base_geolocalize.google_map_api_key', vals.get('google_map_api_key', None))
        for c in self:
            sessions = self.env['pos.session'].search([
                ('config_id', '=', c.id),
                ('state', '=', 'opened')
            ])
            sessions.update_stock_at_closing = c.point_of_sale_update_stock_quantities == 'closing'
        return res

    @api.model
    def create(self, vals):
        if vals.get('allow_discount', False) or vals.get('allow_qty', False) or vals.get('allow_price', False):
            vals['allow_numpad'] = True
        if vals.get('expired_days_voucher', 0) < 0:
            raise UserError('Expired days of voucher could not smaller than 0')
        config = super(PosConfig, self).create(vals)
        if config.pos_order_period_return_days <= 0:
            raise UserError('Period days return orders and products required bigger than or equal 0 day')
        if config.management_session and not config.default_cashbox_id and not config.cash_control:
            raise UserError(
                'Your POS config missed config Default Opening (Cash Control), Please go to Cash control and set Default Opening')
        if vals.get('google_map_api_key', None):
            self.env['ir.config_parameter'].sudo().set_param('base_geolocalize.google_map_api_key', vals.get('google_map_api_key', None))
        return config

    @api.onchange('printer_id')
    @api.model
    def onchange_printer_id(self):
        if self.printer_id:
            self.is_posbox = True
            self.iface_print_via_proxy = True
            if not self.proxy_ip:
                warning = {
                    'title': _("Warning, input required !"),
                    'message': _('Please input IoT Box IP Address')
                }
                return {'warning': warning}

    @api.onchange('printer_ids')
    @api.model
    def onchange_printer_ids(self):
        if self.printer_ids:
            for printer in self.printer_ids:
                if printer.printer_type == 'network':
                    self.is_posbox = True
                    self.iface_print_via_proxy = True
                    if not self.proxy_ip:
                        warning = {
                            'title': _("Warning, input required !"),
                            'message': _('Please input IoT Box IP Address')
                        }
                        return {'warning': warning}

    @api.onchange('allow_split_table')
    def _onchange_allow_split_table(self):
        if self.allow_split_table:
            self.iface_splitbill = True

    @api.onchange('is_posbox')
    def _onchange_is_posbox(self):
        super(PosConfig, self)._onchange_is_posbox()
        if not self.is_posbox:
            self.printer_id = False

    @api.model
    @api.onchange('management_session')
    def _onchange_management_session(self):
        self.cash_control = self.management_session

    def init_payment_method(self, journal_name, journal_sequence, journal_code, account_code, pos_method_type):
        Journal = self.env['account.journal'].sudo()
        Method = self.env['pos.payment.method'].sudo()
        IrModelData = self.env['ir.model.data'].sudo()
        IrSequence = self.env['ir.sequence'].sudo()
        Account = self.env['account.account'].sudo()
        user = self.env.user
        accounts = Account.search([
            ('code', '=', account_code), ('company_id', '=', self.company_id.id)])
        if accounts:
            accounts.sudo().write({'reconcile': True})
            account = accounts[0]

        else:
            account = Account.create({
                'name': journal_name,
                'code': account_code,
                'user_type_id': self.env.ref('account.data_account_type_current_assets').id,
                'company_id': self.company_id.id,
                'note': 'code "%s" auto give voucher histories of customers' % account_code,
                'reconcile': True
            })
            model_datas = IrModelData.search([
                ('name', '=', account_code + str(self.company_id.id)),
                ('module', '=', 'pos_retail'),
                ('model', '=', 'account.account'),
                ('res_id', '=', account.id),
            ])
            if not model_datas:
                IrModelData.create({
                    'name': account_code + str(self.company_id.id),
                    'model': 'account.account',
                    'module': 'pos_retail',
                    'res_id': account.id,
                    'noupdate': True,  # If it's False, target record (res_id) will be removed while module update
                })

        journals = Journal.search([
            ('code', '=', journal_code),
            ('company_id', '=', self.company_id.id),
        ])
        if journals:
            journals.sudo().write({
                'loss_account_id': account.id,
                'profit_account_id': account.id,
                'pos_method_type': pos_method_type,
                'sequence': journal_sequence,
            })
            journal = journals[0]
        else:
            new_sequence = IrSequence.create({
                'name': journal_name + str(self.company_id.id),
                'padding': 3,
                'prefix': account_code + str(self.company_id.id),
            })
            model_datas = IrModelData.search(
                [
                    ('name', '=', account_code + str(new_sequence.id)),
                    ('module', '=', 'pos_retail'),
                    ('model', '=', 'ir.sequence'),
                    ('res_id', '=', new_sequence.id),
                ])
            if not model_datas:
                IrModelData.create({
                    'name': account_code + str(new_sequence.id),
                    'model': 'ir.sequence',
                    'module': 'pos_retail',
                    'res_id': new_sequence.id,
                    'noupdate': True,
                })
            journal = Journal.create({
                'name': journal_name,
                'code': journal_code,
                'type': 'cash',
                'pos_method_type': pos_method_type,
                'company_id': self.company_id.id,
                'loss_account_id': account.id,
                'profit_account_id': account.id,
                'sequence': journal_sequence,
            })
            model_datas = IrModelData.search(
                [
                    ('name', '=', account_code + str(journal.id)),
                    ('module', '=', 'pos_retail'),
                    ('model', '=', 'account.journal'),
                    ('res_id', '=', int(journal.id)),
                ])
            if not model_datas:
                IrModelData.create({
                    'name': account_code + str(journal.id),
                    'model': 'account.journal',
                    'module': 'pos_retail',
                    'res_id': int(journal.id),
                    'noupdate': True,
                })
        methods = Method.search([
            ('name', '=', journal_name),
            ('company_id', '=', self.company_id.id)
        ])
        if not methods:
            method = Method.create({
                'name': journal_name,
                'receivable_account_id': account.id,
                'cash_journal_id': journal.id,
                'company_id': self.company_id.id,
            })
        else:
            method_ids = [method.id for method in methods]
            if len(method_ids) > 0:
                method_ids.append(0)
                self.env.cr.execute(
                    "UPDATE pos_payment_method SET is_cash_count=False where id in %s", (tuple(method_ids),))
            method = methods[0]
        for config in self:
            opened_session = config.mapped('session_ids').filtered(lambda s: s.state != 'closed')
            if not opened_session:
                payment_method_added_ids = [payment_method.id for payment_method in config.payment_method_ids]
                if method.id not in payment_method_added_ids:
                    payment_method_added_ids.append(method.id)
                    config.sudo().write({
                        'payment_method_ids': [(6, 0, payment_method_added_ids)],
                    })
        return True

    def open_ui(self):
        self.ensure_one()
        if not self.picking_type_id.default_location_src_id:
            raise UserError(
                'It not possible start POS Session if your POS Operation Type: %s not set Default Source Location' % self.picking_type_id.name)
        self.init_payment_method('Voucher', 100, 'JV', 'AJV', 'voucher')
        self.init_payment_method('Wallet', 101, 'JW', 'AJW', 'wallet')
        self.init_payment_method('Credit', 102, 'JC', 'AJC', 'credit')
        self.init_payment_method('Return Order', 103, 'JRO', 'AJRO', 'return')
        self.init_payment_method('Rounding Amount', 100, 'JRA', 'AJRA', 'rounding')
        return super(PosConfig, self).open_ui()

    def open_session_cb(self):
        self.ensure_one()
        if not self.picking_type_id.default_location_src_id:
            raise UserError(
                'It not possible start POS Session if your POS Operation Type: %s not set Default Source Location' % self.picking_type_id.name)
        self.init_payment_method('Voucher', 100, 'JV', 'AJV', 'voucher')
        self.init_payment_method('Wallet', 101, 'JW', 'AJW', 'wallet')
        self.init_payment_method('Credit', 102, 'JC', 'AJC', 'credit')
        self.init_payment_method('Return Order', 103, 'JRO', 'AJRO', 'return')
        self.init_payment_method('Rounding Amount', 100, 'JRA', 'AJRA', 'rounding')
        return super(PosConfig, self).open_session_cb()

    def get_voucher_number(self, config_id):
        config = self.browse(config_id)
        if not config.voucher_sequence_id:
            raise UserError(
                u'Your POS Config not setting Voucher Sequence, please contact your POS Manager setting it before try this feature')
        else:
            return config.voucher_sequence_id._next()

    # TODO: for supported multi pricelist difference currency
    @api.constrains('pricelist_id', 'use_pricelist', 'available_pricelist_ids', 'journal_id', 'invoice_journal_id',
                    'payment_method_ids')
    def _check_currencies(self):
        return True
        # for config in self:
        #     if config.use_pricelist and config.pricelist_id not in config.available_pricelist_ids:
        #         raise ValidationError(_("The default pricelist must be included in the available pricelists."))
        # if self.invoice_journal_id.currency_id and self.invoice_journal_id.currency_id != self.currency_id:
        #     raise ValidationError(_(
        #         "The invoice journal must be in the same currency as the Sales Journal or the company currency if that is not set."))
        # if any(
        #         self.payment_method_ids \
        #                 .filtered(lambda pm: pm.is_cash_count) \
        #                 .mapped(
        #             lambda pm: self.currency_id not in (self.company_id.currency_id | pm.cash_journal_id.currency_id))
        # ):
        #     raise ValidationError(_(
        #         "All payment methods must be in the same currency as the Sales Journal or the company currency if that is not set."))

    def new_rate(self, from_amount, to_currency):
        pricelist_currency = self.env['res.currency'].browse(to_currency)
        company_currency = self.company_id.currency_id
        new_rate = company_currency._convert(from_amount, pricelist_currency,
                                             self.company_id or self.env.user.company_id, fields.Date.today())
        return new_rate

    def _open_session(self, session_id):
        session_form = super(PosConfig, self)._open_session(session_id)
        session = self.env['pos.session'].browse(session_id)
        if session.config_id.start_session_oneclick:
            session.action_pos_session_open()
            return session.open_frontend_cb()
        else:
            return session_form
