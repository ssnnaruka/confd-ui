//>>built
define("gridx/modules/HiddenColumns",["dojo/_base/declare","dojo/_base/Deferred","dojo/_base/array","dojo/query","../core/_Module"],function(p,q,f,m,r){return p(r,{name:"hiddenColumns",load:function(a,b){var d=this,c=d.grid,e=d.arg("init",[]);d._cols=c._columns.slice();d.aspect(c,"setColumns",function(){d._cols=c._columns.slice()});c.move&&c.move.column&&d.connect(c.move.column,"onMoved","_syncOrder");c.persist&&(e=e.concat(c.persist.registerAndLoad("hiddenColumns",function(){return d.get()})||[]));
e.length?b.then(function(){d.add.apply(d,e);d.loaded.callback()}):d.loaded.callback()},add:function(){for(var a=this,b=a.grid,d=b._columnsById,c=b._columns,e=b.columnLock,g=0,l={},k=f.filter(f.map(arguments,function(a){a=a&&"object"===typeof a?a.id:a;return d[a]}),function(a){return a&&!a.ignore&&(void 0===a.hidable||a.hidable)}),n=0,s=k.length;n<s;++n)l[k[n].id]=k[n];var k=[],h;for(h in l)k.push(l[h]);e&&(g=e.count,e.unlock());f.forEach(k,function(a){a.index<g&&--g;a.hidden=!0;delete d[a.id];c.splice(f.indexOf(c,
a),1);m('[colid\x3d"'+b._escapeId(a.id)+'"].gridxCell',b.domNode).forEach(function(a){a.parentNode.removeChild(a)})});k.length&&f.forEach(c,function(a,b){a.index=b});b.columnWidth._adaptWidth();m(".gridxCell",b.bodyNode).forEach(function(a){var b=a.style;b.width=b.minWidth=b.maxWidth=d[a.getAttribute("colid")].width});if(b.vScroller._doVirtualScroll)b.body.onForcedScroll();return a._refresh(0).then(function(){a.onHide(f.map(k,function(a){return a.id}));e&&0<g&&e.lock(g)})},remove:function(){var a=
this,b=a.grid,d=b._columns,c=b.columnLock,e=0,g,l=[];c&&(e=c.count,c.unlock());f.forEach(arguments,function(b){b=b&&"object"===typeof b?b.id:b;for(var c,f=-1,h=0,m=a._cols.length;h<m;++h)if(c=a._cols[h],c.id===b&&c.hidden){delete c.hidden;c.index=++f;l.push(c);break}else c.hidden||(f=c.index);if(h<m){g=1;a.grid._columnsById[b]=c;f<e&&(c.index=f=e);d.splice(f,0,c);for(h=f+1;h<d.length;++h)d[h].index=h}});return a._refresh(g).then(function(){a.onShow(f.map(l,function(a){return a.id}));c&&0<e&&c.lock(e)})},
clear:function(){var a=this.grid,b=a.columnLock,d=0,c;b&&(d=b.count,b.unlock());a._columns=f.map(this._cols,function(b,d){b.index=d;b.hidden&&(c=1,delete b.hidden,a._columnsById[b.id]=b);return b});return this._refresh(c).then(function(){b&&0<d&&b.lock(d)})},get:function(){for(var a=[],b=this._cols,d=0;d<b.length;++d)b[d].hidden&&a.push(b[d].id);return a},onShow:function(a){},onHide:function(a){},_syncOrder:function(){for(var a=this._cols,b=this.grid._columns,d=0,c=0,e,g;d<b.length&&c<a.length;++d,
++c){for(e=a[c];e.hidden;e=a[c])++c;b[d]!=e&&(g=f.indexOf(a,b[d]),a[c]=a[g],a[g]=e)}},_refresh:function(a){var b=this.grid;if(a)return b.header.refresh(),b.columnWidth._adaptWidth(),b.body.refresh();a=new q;b.header.onRender();a.callback();return a}})});
//# sourceMappingURL=HiddenColumns.js.map