define([
    'lodash', 'jquery',

    'dojo/_base/declare',
    'dojo/_base/Deferred',
    'dojo/dom-class',
    'dojo/data/ObjectStore',
    'dojo/store/Memory',

	'dijit/_WidgetBase',
	'dijit/_TemplatedMixin',
    'dijit/_Container',

    'gridx/core/model/cache/Sync',
    'gridx/core/model/cache/Async',
    'gridx/Grid',
    'gridx/modules/RowHeader',
    'gridx/modules/select/Row',
    'gridx/modules/IndirectSelect',
    'gridx/modules/SingleSort',
    'gridx/modules/Edit',
    'gridx/modules/CellWidget',
    'gridx/modules/VirtualVScroller',
	'gridx/modules/Dod',
	'gridx/modules/Bar',
    'gridx/modules/ColumnResizer',

    'tailf/global',
    'tailf/core/logger',
    'tailf/core/yang/Keypath',
    'tailf/dojo/store/yang/ListSchemaRW',

	'dojo/text!./templates/List.html'
], function(
    _, $,

    declare, Deferred, domClass, ObjectStore, Memory,
    _WidgetBase, _TemplateMixin, _Container,

    SyncCache, AsyncCache, Grid,
    RowHeader, SelectRow, IndirectSelect, SingleSort, Edit, CellWidget, VirtualVScroller, Dod,
    Bar, ColumnResizer,

    tailfGlobal, logger, Keypath,
    ListSchemaStore,

    template
) {

function _error(text, err) {
    logger.error(text + ' : err=', err);
}

return declare([_WidgetBase, _TemplateMixin, _Container], {
	templateString: template,

    additionalClass : '',

    // List schema instance
    // Keypath and keys are extracted from the schema.
    schema : undefined,

    keypath : undefined,
    keys    : undefined,

    // Array of field specifications
    //
    // {
    //    name     : <yang leaf name>
    //    text     : Column header text (optional, default using name)
    //    editable : true/false (inlineEditable must be == true),
    //    decorator : function(value) {return <html> for the value} (optional)
    //    widgetsInCell : boolean (optional)
    //    onCellWidgetCreated : function(cellWidget, rowData)
    //    setCellValue : function(gridData, storeData, cellWidget)
    // }
    fields : undefined,

    inlineEditable : true,
    columnWidthAutoResize : true,

    toolbar : undefined,

    editable      : true,
    selectableRow : false,

    callbacks : {
        // function({
        //      list       : List instance
        //      row        : Row data
        //      rowKeypath : Keypath to row
        //      node       : Node to place the widget at
        //      deferred   : Dojo deferred object to callback when finished
        // })
        renderDetail : undefined,

        // function({
        //      value   : Cell value
        //      id      : Row id
        //      keypath : Row item keypath
        //      item    : Row item
        // })
        keyDecorator : undefined
    },

    _listKeypath : undefined,
    _listKeys    : undefined,

    postCreate : function() {
        var me = this;
        this.inherited(arguments);

        domClass.add(me.domNode, me.additionalClass);

        me._getGridStructure().done(function(result) {
            me._addGrid(result);
        });

        this._listEventHandle = undefined;

    },

    destroy : function() {
        this._unsubscribeToModelEvents();
        this.inherited(arguments);
    },

    resize : function() {
        this.grid.resize();
    },

    refresh : function() {
        this.grid.model.clearCache();
        this.grid.body.refresh();
    },

    getSelectedRows : function() {
        var ret = [];
        var ids = this.grid.select.row.getSelected();

        _.each(ids, function(id) {
            this.grid.store.fetchItemByIdentity({
                identity : id,
                onItem : function(value) {
                    ret.push(value);
                }
            });
        }, this);

        return ret;
    },

    deleteSelectedRows : function() {
        var me = this;
        var ids = me.grid.select.row.getSelected();

        _.each(ids, function(id) {
            me.grid.store.objectStore.remove(id);
        });

        me.refresh();
    },

    _subscribeToModelEvents : function(keypath) {
        var me = this;
        var events = tailfGlobal.getEvents();

        this.refreshAfterEvents = true;

        events.subscribeChanges({
            path               : keypath,
            skip_local_changes : true,

            callback : function() {
                if (me.refreshAfterEvents) {
                    me.refreshAfterEvents = false;
                    me.refresh();

                    setTimeout(function() {
                        // Hysteresis
                        me.refreshAfterEvents = true;
                    }, 1000);
                }
            }
        }).done(function(handle) {
            // FIXME: Add testcase with no parameters, we ended up here, i.e. no error, what's the semantics?
            me._listEventHandle = handle;
        }).fail(function(err) {
            _error('_subscribeToModelEvents', err);
        });
    },

    _unsubscribeToModelEvents : function() {
        var events = tailfGlobal.getEvents();
        if (this._listEventHandle !== undefined) {
            events.unsubscribe(this._listEventHandle);
            this._listEventHandle = undefined;
        }
    },

    _getGridStructure : function() {
        if (this.schema) {
            return this._getGridStructureFromSchema(this.schema);
        } else {
            return this._getGridStructureFromKeypath({
                keypath : this.keypath,
                keys    : this.keys,
                fields  : this.fields
            });
        }
    },

    _getGridStructureFromSchema : function(schema) {
        var deferred = $.Deferred();
        var keys   = [];
        var fields = [];
        var specifiedFields = _.isArray(this.fields);

        var readOnly = schema.isReadOnly() || schema.isOper();

        _.each(schema.getChildren(), function(child) {
            var name = child.getName();
            var kind = child.getKind();

            if ((kind === 'key') || (kind === 'leaf')) {
                var editable = !readOnly && !child.isOperational();

                if (kind === 'key') {
                    keys.push(name);
                    editable = false;
                }

                fields.push({
                    name : name,
                    editable : editable
                });
            }
        });

        if (specifiedFields) {
            fields = this.fields;
        }

        deferred.resolve({
            schema    : schema,
            keypath   : schema.getKeypath(),
            keys      : undefined, // Not using keys due to eventual store (non-) usage
            fields    : fields,
            _listKeys : keys
        });

        return deferred.promise();
    },

    _getGridStructureFromKeypath : function(args) {
        var deferred = $.Deferred();

        deferred.resolve({
            keypath   : args.keypath,
            keys      : args.keys,
            fields    : args.fields
        });

        return deferred.promise();
    },

    _fieldsToGridStructure : function(fields, getStore) {
        var me = this;
        var structure = [];

        _.each(fields, function(field) {
            var id = field;
            var name = field;
            var _field = name;
            var editable = me.inlineEditable;
            var decorator;
            var widgetsInCell = false;
            var onCellWidgetCreated;
            var setCellValue;
            var editor;
            var editorArgs;
            var customApplyEdit;

            if (_.isObject(field)) {
                id = field.name;

                name = field.name;
                if (_.isString(field.text)) {
                    name = field.text;
                }

                editable = me.inlineEditable && field.editable;
                _field = field.name;

                decorator = field.decorator;
                widgetsInCell = field.widgetsInCell ? true : false;
                onCellWidgetCreated = field.onCellWidgetCreated;
                setCellValue = field.setCellValue;
                editor = field.editor;
                editorArgs = field.editorArgs;
                customApplyEdit = field.customApplyEdit;
            }

            if (!decorator && me._isKey(_field) && _.isFunction(me.callbacks.keyDecorator)) {
                decorator = function(value, id) {
                    var item = me.grid.store.objectStore.get(id);
                    return me.callbacks.keyDecorator({
                        value   : value,
                        id      : id,
                        item    : item,
                        keypath : me._getListItemKeypath(item)
                    });
                };
            }

            var fieldArgs = {
                id        : id,
                name      : name,
                editable  : editable,
                field     : _field,
                decorator : decorator,
                initializeEditor : function(editor, cell) {
                    var row = getStore().get(cell.row.id);
                    var value = row[cell.column.id];
                    editor.setDisplayedValue(value);
                },

                widgetsInCell : widgetsInCell,
                onCellWidgetCreated : onCellWidgetCreated,
                setCellValue : setCellValue,
                editor: editor,
                editorArgs: editorArgs,
                customApplyEdit: customApplyEdit,
            };

            structure.push(fieldArgs);
        });

        return structure;
    },

    _isKey : function(name) {
        var ret = false;
        _.each(this._listKeys, function(key) {
            if (key === name) {
                ret = true;
                return false;
            }
        });
        return ret;
    },

    _addGrid : function(args) {
        var me = this;
        var grid = me._createGrid(args);

        me.grid = grid;
        me.addChild(grid);
    },

    _createGrid : function(args) {
        var me = this;

        var schema = args.schema;
        var keypath = args.keypath;
        var keys = args.keys;
        var fields = args.fields;
        var store = args.store;

        var sortable = true;
        var editable = this.editable;
        var columnResizable = true;
        var selectableRow = this.selectableRow;
        var grid;

        this._listKeypath = keypath;
        this._listKeys    = keys;

        if (_.isArray(args._listKeys)) {
            this._listKeys = args._listKeys;
        }

        if (schema) {
            editable = editable && !schema.isReadOnly() && !schema.isOper();
        }

        me._subscribeToModelEvents(keypath);

        var emptyStore = new Memory({
            data : []
        });

        var _fields = [];
        _.each(fields, function(field) {
            if (_.isObject(field)) {
                _fields.push(field.name);
            } else {
                _fields.push(field);
            }
        });


        var structure = this._fieldsToGridStructure(fields, function() {
            return grid.store.objectStore;
        });

        _.each(fields, function(field) {
            if(field.updateInEditor) {
                _.remove(_fields, function(f) { return f === field.name; });
            }
        });


        if (me.store) {
            store = me.store;
        } else {
            store = new ListSchemaStore({
                schema  : schema,
                keypath : keypath,
                keys    : keys,
                fields  : _fields
            });
        }

        var modules = [
        ];

        if (selectableRow) {
            modules.push(RowHeader);
            modules.push(IndirectSelect);
            modules.push(SelectRow);
        }

        if (sortable) {
            modules.push(SingleSort);
        }

        if (editable) {
            modules.push(CellWidget);
            modules.push({
                moduleClass : Edit,
                onApply : function(cell, applySuccess) {
                    var row = grid.row(cell.row.id);
                    var _cell = row.cell(cell.column);
                    var el = $(_cell.node());

                    if (applySuccess) {
                        el.removeClass('tailf-edit-failure');
                        el.addClass('tailf-edit-success');
                    } else {
                        el.removeClass('tailf-edit-success');
                        el.addClass('tailf-edit-failure');
                     }
                }
            });
        }

        if (columnResizable) {
            modules.push(ColumnResizer);
        }

        if (_.isFunction(me.callbacks.renderDetail)) {
            modules.push(VirtualVScroller);

            modules.push({
                moduleClass    : Dod,
                defaultShow    : false,
                useAnimation   : true,
                duration       : 200,
                showExpando    : true,
                detailProvider : function(grid, rowId, detailNode, renderred) {
                    me._inlineRenderDetail(grid, rowId, detailNode, renderred);
                }
            });
        }

        var gridProps = {
            cacheClass: AsyncCache,
            store: emptyStore,
            structure: structure,
            modules : modules,
            selectRowTriggerOnCell: true,
            columnWidthAutoResize: me.columnWidthAutoResize
            //autoHeight : true,
        };

        if (me.toolbar) {
            modules.push(Bar);
            gridProps.barTop = [me.toolbar];
        }

        grid = new Grid(gridProps);

        grid.startup();

        setTimeout(function() {
            //grid.setStore(store);
            grid.setStore(new ObjectStore({objectStore : store}));
        });
        return grid;
    },

    _inlineRenderDetail : function(grid, rowId, detailNode, renderred) {
        var row = this.grid.store.objectStore.get(rowId);

        if (_.isFunction(this.callbacks.renderDetail)) {
            this.callbacks.renderDetail({
                list       : this,
                row        : row,
                rowKeypath : this._getListItemKeypath(row),
                node       : detailNode,
                deferred   : renderred
            });
        }
    },

    _getListKeypath : function() {
        return this._listKeypath;
    },

    _getListItemKeypath : function(rowData) {
        var path = this._getListKeypath();
        var keys = [];

        _.each(this._listKeys, function(key) {
            keys.push(rowData[key]);
        });

        path += Keypath.listKeyIndex(keys);

        return path;
    }
});

});
