/*********************************************************************************
    (c) Copyright 2018 - JDA IT Solutions - Julien Darrort . All rights reserved.
**********************************************************************************/
/*
    Description :  Rendering processor -   New Engine.
    Inspired by other frameworks, angular/vue. Only for the rendering abilities.
    Limited scope of functionalities...
     * Warning, source data provided may be altered by custom functions (no data copies)
     * Expression will look for data in this order
      1/ in current rendering context (variables created at render time)
      2/ in specific context_data provided in StartRender
      3/ in core app provided. 
     * Limited capacity for bindings.

    Possibility to "stack" context datas, allowing to render a sub template with a dedicated set
    of data .

*/

Date.prototype._toString = Date.prototype.toString ;
Date.prototype.toString = Date.prototype.toLocaleDateString;
Date.prototype.YYMMDD = function() { return this.toString().slice(0,10)};
Number.prototype.toEuros = function() {
  return this.toLocaleString('fr-FR', {minimumFractionDigits : 2, maximumFractionDigits : 2}) + " €"
}
String.prototype.toEuros = function() {
  if (Number.isNaN(parseFloat(this))){ return this.toString()};
  return parseFloat(this).toLocaleString('fr-FR', {minimumFractionDigits : 2, maximumFractionDigits : 2}) + " €"
}

/*********************************************************************************
    DOM manipulation extension
**********************************************************************************/
var dom = {};
dom.get = function(a) { return document.getElementById(a);}
dom.create = function(a,id) { 
    var a = document.createElement(a);
    if (id) {a.setAttribute("id",id);}
    return a;
}

//------------------------------------------------------
//------------------------------------------------------
// For EDGE compatibility
Element.prototype.getAttributeNames = Element.prototype.getAttributeNames || function () {return Object.values(this.attributes); };
// UTility function to copy a NodeList collection to another DOM target.
NodeList.prototype.appendTo = function( in_target_el ) {  while( this.length ) { in_target_el.appendChild(this[0]); } return this;}
Element.prototype.appendTo = function( in_target_el ) {  in_target_el.appendChild(this); return this; }
NodeList.prototype.prependTo = function( in_target_el ) {  while( this.length ) { in_target_el.prepend(this[this.length -1]); } return this;}
Element.prototype.prependTo = function( in_target_el ) {  in_target_el.prepend(this); return this; }

Element.prototype.clear = function( ) {   this.innerHTML = ""; return this;}
// get or Set
Element.prototype.text = function( in_text ) { 
  if (in_text !== undefined ) {this.innerText = in_text;return this;}  
  return this.innerText;
}
Element.prototype.html = function( in_html_content) { 
  if (in_html_content !== undefined ) {this.innerHTML = in_html_content;return this;}
  return this.innerHTML;
}
Element.prototype.show = function( ) {
  if (this.style.display == "none") {
      this.style.display = this._default_display || "";
  }
  return this;
}
Element.prototype.hide = function( ) {
  if (this.style.display != "none") {
    this.toggle();
  }
  return this;
}
Element.prototype.toggle = function( ) {
  if (this.style.display == "none") {
      this.style.display = this._default_display || "";
  } else {
      this._default_display = this.style.display ;
      this.style.display = "none";
  }
  return this;
}
Element.prototype.val = function( val) {   if (val) { this.value = val; }  return this.value;  }
Element.prototype.css = function( style, val) { 
  if (typeof style === "object" && arguments.length == 1) {
    Object.entries(style).forEach( ([s,v]) => { this.style[s] = v; })
    return this;
  }
  this.style[style] = val;
  return this;
}
Element.prototype.prop = function( in_prop, val) {   
  if (! val && typeof in_prop =="string")  { return this.getAttribute(in_prop)};
  this.setAttribute(in_prop, val);  return this;
}
Element.prototype.addClass = function( in_class) {   this.classList.add(in_class);  return this;}
Element.prototype.removeClass = function( in_class) {   this.classList.remove(in_class);  return this;}
Element.prototype.toggleClass = function( in_class) {   this.classList.toggle(in_class);  return this;}
Element.prototype.on = function( in_event, in_fn, in_clickable =false) { 
  this.addEventListener(in_event, in_fn);
  in_clickable ? this.clickable():null;
  return this;
}
Element.prototype.clickable = function( ) {   this.style.cursor="pointer";  return this;}



/*********************************************************************************
    JNgine
**********************************************************************************/

// !!! Achtung with <z> : This does not work :  When cloned, "z" is attached outside of the tr
/*
        <tr :pause>
            <th width="20"></th>
            <th>Params</th>
            <z :for="spec in specific_fields"><th :pause>{{spec.title}}</th></z>
            <th>Group</th>
            <th>DataSource</th>
       </tr>
*/
const C_REFRESH= "_bind_refresh__";
const  C_NOBIND = "_donotbind_"
var JNgine = new (function () {
  var _this = this;
  'use strict';
  // Determine structure
  const isFuncRE = /^(\w+)\((.*)\)$/;
  const isVarRE = /^\s*(\${0,1}[a-zA-Z0-9_.]+)\s*$/; // return a var 
/*
  // accept toto.tata, toto, $.tata , #.tata, my_var1[my_var2].prop1
  const isVarRE3OLD = /^\s*(((\$\.){0,1}|(\#\.){0,1})[a-zA-Z0-9_.\[\]\(\)]+)\s*$/; // var that may refrence an object // like    my_var1[my_var2].prop1, myobj.toUpperCase()
  const isVarRE3_gOLD = /(((\$\.){0,1}|(\#\.){0,1})[a-zA-Z0-9_.\[\]\(\)]+)/g; 
  const isVarRE3 = /^\s*(((\$\.){0,1}|(#\.){0,1}|(@\.){0,1})[a-zA-Z0-9_.\[\]\(\)]+)\s*$/; // var that may refrence an object // like    my_var1[my_var2].prop1, myobj.toUpperCase()
  const isVarRE3_g = /(((\$\.){0,1}|(\#\.){0,1}|(@\.){0,1})[a-zA-Z0-9_.\[\]\(\)]+)/g; 
*/

  // RegExp used in vue to identify quoted strings in an expression
  const VUEstripStringRE = /'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*\$\{|\}(?:[^`\\]|\\.)*`|`(?:[^`\\]|\\.)*`/g;
/*
  const isStringRE = /^['|"](.*)["|']$/;  // ex "'toto'" ou "'  43434 " 
  const isNumRE = /^\s*(\d+)\s*$/;
 */
  const checkEventExprRE = /^(\w+)\s+with\s+(.+)\s*$/; //  "myfct with var1,'txt2'"
  const checkEventExprRE_NEW = /^\s*(.+)\s+with\s+(.+)\s*$/; //  "myfct with var1,'txt2'"

  this.pre_directives = [":pause", ":if", ":if-defined", ":for", ":repeat", ":tabs_domain", ":default"];

  this.dbg  = function (txt) { console.debug("[Ngn] " + txt); }
  this.log  = function (txt) { console.log("[Ngn] " + txt); }
  this.warn = function (txt) { console.warn("[Ngn] " + txt); }
  this.err  = function (txt) { console.error("[Ngn] " + txt); }

  isDefined = function(o) {return o !== undefined && o != null; }
  isFn = function(o) {return typeof o == "function"}
  this.watched_expr=[];
  // Enrich App object with JNgine attributes
  this.extend = function(in_app){
    in_app.$refs={};
    in_app.$focus = null;
    in_app.$bindmaps={};
    in_app.$tabs={};
    in_app.$forms=[];
    in_app.$errors=[];
  }

  this.RenderTemplateTo = function(in_tpl_id, in_app, in_data, in_target_el){
    let target_el = in_target_el;
    if (! target_el instanceof HTMLElement) {
      throw new Error("Not a valid HTML element to append result");
    }

    let results = this.RenderTemplate(in_tpl_id, in_app, in_data);
    results.els.appendTo(target_el);
    
    // apply Focus
    if (results.ctx.$focus){
      results.ctx.$focus.focus();
    }

    return results;
  }

  // ==================================================
  // Clone an ID-ed template, return rendered clone.
  // Returns  ChildNodes collection and context data.
  // ==================================================
  this.RenderTemplate = function(in_tpl_id, in_app, in_data){
    var el_tpl = document.getElementById( in_tpl_id );
    if ( ! el_tpl ) {
        this.warn("Template not found : " + in_tpl_id );
        throw new Error("Template not found : " + in_tpl_id );
    }
    var tpl_clone = el_tpl.cloneNode( true );
    // specific handling of "template" objects, for which ChildNodes are under "content"
    if (tpl_clone.tagName == "TEMPLATE"){
        tpl_clone = tpl_clone.content;
    }
    // create div holder for all childNodes of template
    var new_el = document.createElement("div");
    while (tpl_clone.childNodes.length > 0) {
        new_el.appendChild(tpl_clone.childNodes[0]);
    }
    var result = this.StartRender(new_el, in_app, in_data);
    return {els : result.el.childNodes, ctx: result.ctx } ;
  }
  // ==================================================
  this.StartRender = function (el, in_app, in_ctx_data) {
    // Will render the "el" HTMLElement passed, thus modifying it

    // return context data that can provide post processing handling by the caller.

    if (!(el instanceof HTMLElement ) ) {
      this.err("No HTMLElement given to render");
      return;
    }

    // initialize Context
    let ctx = {
      $app: in_app,
      //Not ready yet
      //$data: CST ? [{CST : CST}, in_ctx_data || {}] : [in_ctx_data || {}], // Stack context data, adding global "CST"
      $data: [in_ctx_data || {}], // Stack context data
      $render:  {},
      $focus :  null,
      $root_el: el,
      $instance_refs: {}, // Only the ref created during this rendering session
      $refs: in_app.$refs || {},
      $errors: [],
      $forms:  in_app.$forms ||[], // forms
      $forms_stack: [], // stacked forms
      $tabs: in_app.$tabs || {},
      //$bindmaps: {},
      $bindmaps: in_app.$bindmaps || {},
      $cur_tab: null
    }
    // Start Processing...
    this.handleNode(el, ctx);

    //------------
    if (ctx.$errors.length) {
      this.warn("Errors while processing");
      //ctx.$errors.forEach(function(e){console.warn(e);});
    }

    if (in_app.$focus!== undefined) in_app.$focus = ctx.$focus;
    if (in_app.$bindmaps!== undefined) in_app.$bindmaps = ctx.$bindmaps;
    if (in_app.$tabs!== undefined) in_app.$tabs = ctx.$tabs;
    if (in_app.$errors!== undefined) in_app.$errors.unshift(ctx.$errors);
    // return an object : 
    return { el: el, ctx: ctx };
  }

  // Log Processing Error. Always associated with an element.
  // Place a breakpoint HERE to investigate
  this.logErr = function (in_el, in_msg, in_ctx) {
    this.warn(in_msg);
    in_ctx.$errors.push({ el: in_el, txt: in_msg });
  }


  // ==================================================
  this.handleNode = function (in_el, in_ctx) {
    var _this = this;
    let b_manage_content = true;
    let local_ctx = {}; // Local Context that shall not be propagated outside this node.
    'use strict';
    // -------------------------------------------------
    // Manage node Attributes
    try {

      // create a "origDef" attribute, that will contain some 
      in_el.origDef = {};

      // ------------------------------------
      // ------------------------------------
      // PRE  processing other attributes 
      // ------------------------------------
      // ------------------------------------
      // Preprocessing (First priority attributes)
      let el_attrs = in_el.getAttributeNames ? in_el.getAttributeNames():{};
      let pre_directives = el_attrs.filter( a => (this.pre_directives.indexOf(a) >=0 ) );
      let directives = el_attrs.filter( a => (a[0] == ":" && pre_directives.indexOf(a) == -1) );
      let var_attrs = el_attrs.filter(  a => (a[0] == "$") );
      let event_attrs   = el_attrs.filter( a => (a[0] == "@") );

      // Process Pre Directives.
      let b_skip_node = false;
      pre_directives.forEach( attr => {
        let attr_val = in_el.getAttribute("attr");
        switch ( attr ) {
          case ':pause' : 
            this.log("Pause Here"); 
            break;
          case ':for' : 
          case ':repeat' : 
            this.fn(attr.slice(1), in_el.getAttribute(attr), in_el, in_ctx, local_ctx); 
            // Don't continue processing this element
            b_skip_node = true;
            break;
          default  : // for, repeat
            this.fn(attr.slice(1), in_el.getAttribute(attr), in_el, in_ctx, local_ctx); 
            break;
        }
      });
      if (b_skip_node) {return;}

      // Special tags
      if (["INFOBOX"].indexOf(in_el.tagName) >= 0){
        this.fn_map.infobox(in_el, in_ctx)
      }
      // Forms : Add them to context
      if (in_el.tagName == "FORM"){
        let f_opts={};
        local_ctx["form"]= {};
        let form_ctx = {
          el : in_el, 
          data : {},
          opts : f_opts
        };
        in_ctx.$forms_stack.unshift( form_ctx );
        in_ctx.$forms.push(form_ctx);
        in_el.$data = form_ctx.data;
      }

      // ------------------------------------
      // ------------------------------------
      // Process other attributes 
      // ------------------------------------
      // ------------------------------------
      // PRocess Variabilized attributes
      var_attrs.forEach((a) => {
        let attr_name = a.slice(1);
        local_ctx.bindScope = C_NOBIND;
        let attr_val = in_el.getAttribute(a).trim();
        // Remove attribute for element (shall not be displayed)
        in_el.removeAttribute(a);
        if (this.watched_expr.indexOf(attr_val) >=0) {
          this.log("WATCH ME");
        }
        // Must bind this attribute to a variable ? 
        if (attr_name[0] == "@"){
          attr_name = attr_name.slice(1);
          local_ctx.bindScope =  attr_name; //  
        }

        if (attr_name[0] == "$"){
          // Ex : to manage attributes under the form : $$href="#/path1/{{ o.data1 }}"
          attr_name = attr_name.slice(1);
          local_ctx.bindScope =  attr_name; //  $aaa ==> aaa
          attr_val = attr_val.replace(/{{(.+?)}}/g, function (x, exp) {
            let subst="";
            try { subst = JNgine.processExpr(exp, in_ctx, in_el, local_ctx ); } catch(e) {}
            if (subst === null) subst = '';
            return subst
          });          
        } else {
          // Ex : to manage attributes under the form : 
            $href="o.data1"
            $href="getHref()"
          try {
            attr_val = this.processExpr(attr_val, in_ctx, in_el, local_ctx);
            attr_val = isDefined(attr_val) ?  attr_val : '';
          } catch (e) {attr_val = ""}
        }
        
        // Specific processing for SELECT and attribute "value"
        //  <option>  being defined afterwards, must position value in postprocessing.
        if (attr_name == "value") {
          if (in_el.nodeName =="SELECT"){
            in_el.d4_value = attr_val;
          } else if (in_el.nodeName =="TEXTAREA"){
            in_el.text(attr_val);
          } else if (in_el.nodeName =="INPUT" && in_el.type =="radio" ){
            in_el.getAttribute("value") == attr_val ? in_el.checked = true : null;
          } else {
            in_el.setAttribute(attr_name, attr_val);
          }
        } else {
          in_el.setAttribute(attr_name, attr_val);
        }

      }); // End for Variabilized attributes ($)


      // ------------------------------------
      // PRocess Directives attributes
      directives.forEach((a) => {
        let attr_name = a.slice(1);
        local_ctx.bindScope = C_NOBIND;
        let attr_val = in_el.getAttribute(a).trim();
        // Remove attribute for element (shall not be displayed)
        in_el.removeAttribute(a);
        if (this.watched_expr.indexOf(attr_val) >=0) {
          this.log("WATCH ME");
        }
        // Must bind this attribute to a variable ?
        if (attr_name[0] == "@"){
          attr_name = attr_name.slice(1);
          local_ctx.bindScope =  ":" + attr_name; // From :@aaa ==> :aaa
        } 
        // Apply Directive
        if (!this.fn(attr_name, attr_val, in_el, in_ctx, local_ctx)) {
          // when return false, do not process sub objects.
          this.dbg("Skipping child nodes");
          b_manage_content = false;
          return; // exit loop
        }
      }); // End Process Directives attributes (:)
      // ------------------------------------
      // PRocess event attributes
      event_attrs.forEach((a) => {
        let attr_name = a.slice(1);
        local_ctx.bindScope = C_NOBIND;
        let attr_val = in_el.getAttribute(a).trim();
        // Remove attribute for element (shall not be displayed)
        in_el.removeAttribute(a);
        if (this.watched_expr.indexOf(attr_val) >=0) {
          this.log("WATCH ME");
        }
        // Apply Event
        let dom_event = attr_name;
        this.processEvent(dom_event, attr_val, in_el, in_ctx, local_ctx);
      }); // End Process Directives attributes (:)

      // ------------------------------------
      // ------------------------------------
      if (!b_manage_content) return;
      // -------------------------------------------------
      // Manage childNodes content
      // !!! Since we may affect childNodes of current el (if there is a for on one of the childnode)
      // we need to save current child at this moment rather than forEach of in_el
      var childNodes = [];
      in_el.childNodes.forEach(node => {
        childNodes.push(node);
      })
    
      childNodes.forEach((node) => {
        if (node.nodeType == 3) { // TEXT node
          let current_text = (node.tagName == "TEXTAREA") ? node.value : node.data;
          new_text = current_text.replace(/{{(.+?)}}/g, function (x, exp) {
            let subst="";
            try { subst = JNgine.processExpr(exp, in_ctx, node ); } catch(e) {}
            return isDefined(subst) ? subst : '';
          });
          // Substitution with one way bindings.
          new_text = new_text.replace(/{@{(.+?)}}/g, function (x, exp) {
            node.origDef = node.origDef  || new_text;
            let subst="";
            try { subst = JNgine.processExpr(exp, in_ctx, node, {bindScope : "innerText"} ); } catch(e) {}
            return isDefined(subst) ? subst : '';
          });
          if (node.tagName == "TEXTAREA") {
            node.value = new_text;
          } else {
            node.data = new_text;
          }
        } else if (node.nodeType == 1) { // ELEMENT NODE
          this.handleNode(node, in_ctx);
        }
      });

      // -------------------------------------------------
      // -------------------------------------------------
      // -------------------------------------------------
      // Post Processing
      // -------------------------------------------------
      // -------------------------------------------------
      // -------------------------------------------------
      // Preprocess form elements 
      if (["TEXTAREA","SELECT","INPUT"].indexOf(in_el.tagName) >= 0){
        this.manageFormElem(in_el, in_ctx, local_ctx);
      }
      if (local_ctx["formdata"]){
        in_ctx.$formdata=null;
        delete local_ctx["formdata"];
      }
    } catch (e){
      this.warn("Something went wrong...." + e.message);
    }

    // Process included template
    if (local_ctx["includetpl"]) {
      try {
        // check if includetpl under the form  :includetpl="some_template with sthg"
        // will use sthg as context for the includetpl

        var target_tpl = local_ctx["includetpl"];
        let specific_ctx = null;
        let b_specific_ctx = false;
        let re_res = local_ctx["includetpl"].match(checkEventExprRE);
        if (re_res) {
          target_tpl = re_res[1];
          try {specific_ctx = this.processExpr(re_res[2], in_ctx, in_el);} catch (e) {}          
          b_specific_ctx = true;
        }
        

        var incl_el_tpl = document.getElementById(target_tpl).cloneNode(true);
        // specific handling of "template" objects
        if (incl_el_tpl.tagName == "TEMPLATE"){
          incl_el_tpl = incl_el_tpl.content;
        }
        // add template elements
        while (incl_el_tpl.childNodes.length > 0) {
            in_el.appendChild(incl_el_tpl.childNodes[0]);
        }    
        // Redo this node
        if (b_specific_ctx){
          // if specific context, restart from start with that context

          in_ctx.$data.unshift(specific_ctx);
          this.handleNode(in_el, in_ctx );
          in_ctx.$data.shift();
        } else {
          // otherwise (nominal case)
          this.handleNode(in_el, in_ctx );
        }
      } catch (e) {
        this.logErr(in_el, " WAR( includetpl ) : Failed to execute directive .\n Expr: " +local_ctx["includetpl"], in_ctx);
      }
    } // end includetpl


    try {
      // post Handler
      if (local_ctx["posthandler"]) {
        this.fn('handler',  local_ctx["posthandler"], in_el,  in_ctx);
/*        if (typeof local_ctx["posthandler"] == "function"){
          // execute posthandler func
          local_ctx["posthandler"].call( in_ctx.$app, in_el);
        } else {
          this.logErr(in_el, " WAR( posthandler ) : Providden expr is not a function.\n Expr: " + in_exp, in_ctx);
        }*/
      }

      if (local_ctx["tabs_domain"]){
          in_ctx.$cur_tab = in_ctx.$parent_tab ?in_ctx.$parent_tab : undefined;
        // Finished processing a tab domain.
        // If there was a default active tab with a trigger, call it.
        // todo 
      }
      if (local_ctx["form"]){
        in_ctx.$forms_stack.shift();
      }
      if (local_ctx["skipchilds"]){
        return;
      }

      // Specific processing for "<Z>" elements.
      // Must be done at the very end.
      if (in_el.tagName == "Z" || in_el.tagName == "Z-SILENT") {
          // move each child Node just before the Z tag.
          // but possibly, z has no more parent element (when used with  <z :if="1"> for example)
          while (in_el.childNodes.length && in_el.parentNode){
            in_el.parentNode.insertBefore(in_el.childNodes[0], in_el);
          }
        in_el.remove(); // Remove "<z>" tags, childNodes would have been moved just before
      }

    } catch (e){
      this.warn ("went wrong here....");
    }
    // process finalized.
  } // handleNode

  //-----------------------------------
  // Extract Enclosed string
  this.getEnclosed = function (in_txt) {
    // recherche de ")" fermante
    let opening = in_txt[0];
    let closure = in_txt[0];
    let expected = 0;
    let idx = 0;
    switch (opening){
        case '(' : closure = ')'; break;
        case '[' : closure = ']'; break;
        case "'" : closure = "'"; break;
        case '"' : closure = '"'; break;
    }
    for (let c of in_txt) {
        if (c == opening) { expected ++;}
        if (c == closure) { expected --;}
        if (expected == 0) {
            return {
                size : idx + 1,
                enclosed : in_txt.slice(1,idx),
                type : opening
            }
        }
        idx++
    }
    throw new Error("Invalid Expression - No closing found  " + closure)
  }


  //-----------------------------------------
  // Process event declarations.
  this.processEvent = function (in_event, in_exp, in_el, in_ctx, in_lctx) {
    // example 
    //      : @click=manageToto   ==> Will call manageToto with contexte data
    //      : @click=manageToto with i,'ok'  ==> Will call manageToto with contexte data
    // The callback will be called with 2 args : 
    //    - the first arg will be an array of values that are interpreted after the "... with ..."
    //    - The Second arg will be the event that has been triggered.

    let cb_fn_name;
    let cb_params = [];
    let stop_propagation = true ;

    if (in_event[in_event.length-1] == '@'){
      stop_propagation = false;
      in_event = in_event.substring(0, in_event.length - 1 );
      this.dbg("Managing a custom event and keep propagation");
    }

    // Which callback ?
    if (isVarRE.test(in_exp)) {//      : @click=manageToto   ==> Will call manageToto with contexte data
      cb_fn_name = this.processExpr(in_exp, in_ctx, in_el, in_lctx);;
    } else {
      let ev_exp = in_exp.match(checkEventExprRE_NEW);
      if (ev_exp) { //      : @click=manageToto with i,'ok'  ==> Will call manageToto with contexte data
        cb_fn_name = this.processExpr(ev_exp[1], in_ctx, in_el, in_lctx);
        

        // parse vars.
        ev_exp[2].split(",").forEach(function (p, i) {
          // interpret parameter at rendering time.
          cb_params.push(this.processExpr(p, in_ctx, in_el, in_lctx));
        }, this);
      } else {
        this.logErr(in_el, " ERR : Could not identify fn ctx.$app (2) .\n Expr: " + in_exp, in_ctx);
        return;
      }
    }
    if ( ! isFn(cb_fn_name)) {
      this.logErr(in_el, " ERR : callback " + cb_fn_name + " is not a definied function in current  ctx.$app .\n Expr: " + in_exp, in_ctx);
      return;
    }

    if (["click", "contextmenu", "dblclick"].includes(in_event) ) {
      in_el.style.cursor = "pointer";
    }

    in_el.addEventListener(in_event, function (e) {
      if (stop_propagation) {
        e.preventDefault();
        e.stopPropagation();
      }
      let call_params = cb_params.concat([e]);
      cb_fn_name.apply( in_ctx.$app, call_params);
    });
  }
  
   
  //-----------------------------------------
  // $ ==> Refer to context data passed to Ngine
  // # ==> Refer to the caller data from the  calling object ()
  // @ ==> Refer to a data built at rendering time within Ngine
  // 
  // Will not handle exp like    a.b[c+1]
  // Can handle exp like   'c + 1' ,  " 'MyName ' + getName() "
  this.processExpr = function (in_exp, in_ctx, in_el, in_lctx = { bindScope : C_NOBIND }) {
    let exp = in_exp.trim();
    if (exp == "$") {return in_ctx.$data[0];}
    if (exp =="api_path + '3'"){
      console.log("WatchPoint");
    }

    // A Number ? 
    if (/^[0-9]$/.test(exp)) { return exp; }
    
    // An encapsulated string ex :  'xxx'  ? 
    const isStringRE = /^['|"](.*)["|']$/
    if(isStringRE.test(exp)) { // ex "'toto'" ou "'  43434 " 
        if ((exp.split('"').length + exp.split("'").length) == 4) {
            return exp.match(isStringRE)[1];
        }        
    }

    const CpxRe = /[+\-*!=<>]/;
    if (CpxRe.test(exp)) {
      // we will handle each parts separately
      let c, i = 0, sub_exp = "", sub_val, final_fn="";
      while (i < exp.length) {
        c = exp[i];
        if (["+","-","*","!","=", "<", ">"].includes(c)) {
          // when special char found, process current sub expression
          sub_val = this.processExpr (sub_exp.trim(), in_ctx,  in_el , {bindScpe : C_NOBIND});
          // Transform as string   toto ==> 'toto'
          if (typeof sub_val === "string" && sub_val[0] != "'") { sub_val = "'" + sub_val + "'"};
          final_fn += sub_val + c;
          sub_exp = "";
        } else {
          sub_exp += c;
        }
        i++;
      }
      // PRocess last statement
      if (sub_exp.trim() != "") {
        sub_val = this.processExpr (sub_exp.trim(), in_ctx,  in_el , {bindScpe : C_NOBIND});
        if (typeof sub_val === "string" && sub_val[0] != "'") { sub_val = "'" + sub_val + "'"};
        final_fn += sub_val;
      }
      this.dbg("Complex Fn is : " + final_fn);
      let f = new Function("return " + final_fn);
      return f.call(in_ctx.$app);

      /*
      // Previous implem, 
        // throw new Error("Not Handled Yet");
        // Will have to identify what is to be interpreted.
        let SubCpxRE=/([ \d$#@a-zA-Z_'\.\[\]\(\)]+)/mg;
        if (/([ \d$#@a-zA-Z_'\.\[\]\(\)]+)=([ \d$#@a-zA-Z_'\.\[\]\(\)]+)/.test(exp)) {
          this.logErr(in_el, "  ERR : An affectation in a complex exp  has been found.\n Expr: " + exp, in_ctx);
          throw new Error("Forbidden to assign  in statement '='");
        }
        exp = exp.replace(SubCpxRE, (x, substmt) => {
          try {
            substmt = substmt.trim();
            if (substmt[0] == "'") {
              return substmt;
            }
            return this.processExpr (substmt.trim(), in_ctx,  in_el , {bindScpe : C_NOBIND});
          } catch (e) {  }
        })
        this.dbg("Complex Fn is : " + exp);
        let f = new Function("return " + exp);
        return f.call(in_ctx.$app);
        */
    }

    const RE = /^([$]+|[#@]{1}|[a-zA-Z_]+)([\.\[\(]{0,1}.*)/
    let parts = exp.match(RE);
    let next_part;
    var cur_obj, root_obj;
    if (!parts) { 
        throw new Error("exp invalid :" + exp);
    }
    let root = parts[1];
    next_part = root;

    let rest = parts[2].trim();
    if ( root[0] == "$") { 
        // Targetting context Data
        // Looking through context data to find first matching.
        cur_obj =  in_ctx.$data.find( cd => ( ["object", "function"].includes(typeof cd) ) );
    }
    else if ( root == "#") { 
        // Targetting App Data
        cur_obj = in_ctx.$app
    }
    else if ( root == "@") { 
        // Targetting App Data
        cur_obj = in_ctx.$instance_refs
    }    
    else if ( root == "CST"  && window.CST) { 
        // Targetting CST
        cur_obj = window.CST; 
        in_lctx.bindScope = C_NOBIND; // Not bindable

    }
    else { 
      // Find Best context
      root_obj = in_ctx.$render; 
      cur_obj = in_ctx.$render[root]
      if (cur_obj === undefined) {
        // in $data
        let idx =  in_ctx.$data.findIndex( cd => ( ["object", "function"].includes(typeof cd) && cd[root] !== undefined ) );
        if (idx >= 0) {
          root_obj = in_ctx.$data[idx];
          cur_obj = in_ctx.$data[idx][root];
        }
      }
      if (cur_obj === undefined) {
        //in $app
        root_obj = in_ctx.$app; 
        cur_obj = in_ctx.$app[root]
      }
      if (cur_obj === undefined) {
        //in $app
        root_obj = in_ctx.$instance_refs; 
        cur_obj = in_ctx.$instance_refs[root]
      }
      if (cur_obj === undefined) {
        this.logErr(in_el, "  ERR : Could not determine any context.\n Expr: " + in_exp, in_ctx);
      }

      // cur_obj = in_ctx[root]; 
    }

    // Process rest.
    let infos, eval_res, fn_params;
    try {
      while (1){
          if ( rest === "") { break; };
          // console.debug("Analysing " + rest);
          if (typeof cur_obj !== "function"){
            // Cause functions must be called within context of host 
            root_obj = cur_obj;
          }          
          next_part = null;
          switch( rest[0]) {
              case '.' : 
                  rest = rest.slice(1);
                  parts = rest.match(RE);
                  if (!parts) {
                    this.logErr(in_el, "  ERR : Invalid part : '" +rest + "'.\n Expr: " + in_exp, in_ctx);
                    throw new Error("Invalid part")
                  };
                  next_part = parts[1];
                  rest = parts[2];
                  cur_obj = cur_obj[next_part];
                  break;
              case '[' :
                  // Must analyse what is inside. 
                  infos = this.getEnclosed(rest);
                  next_part = this.processExpr (infos.enclosed, in_ctx,  in_el , {bindScpe : C_NOBIND});
                  if ( ! next_part && next_part != 0) {
                    this.logErr(in_el, "  ERR : SubPart not found for : '" +infos.enclosed + "'.\n Expr: " + in_exp, in_ctx);
                    return "";
                  }
                  rest = rest.slice(infos.size);
                  cur_obj = cur_obj[next_part];
                  break;
              case '(' : 
                  infos = this.getEnclosed(rest);
                  fn_params = [];
                  infos.enclosed.split(",").forEach(stmt => {
                      if (stmt.trim()) {
                          fn_params.push(  this.processExpr (stmt.trim(), in_ctx,  in_el , {bindScpe : C_NOBIND}));
                      } else fn_params.push(undefined);
                  })
                  fn_params.push(in_el);
                  rest = rest.slice(infos.size);
                  cur_obj = cur_obj.apply(root_obj, fn_params);
                  break;
              default : 
                  throw new Error("Not Handled");
          } 
        }
    } catch (e) {
      this.logErr(in_el, "  ERR : Could not evaluate  \n Expr: " + in_exp, in_ctx);
    }
    /* At this point, we may want to register binding... */
    if ( in_lctx.bindScope && in_lctx.bindScope != C_REFRESH && in_lctx.bindScope != C_NOBIND ){
      this.JBind({
        el : in_el,
        ctx : in_ctx,
        fqdn : exp,
        obj : root_obj,
        prop: next_part,
        bind_scope : in_lctx.bindScope
      });
    }      
    return cur_obj;
  }

  // ------------------------------------------------------------------
  // Propagate a change to the form object
  this.manageFormElem = function(in_el, in_ctx, in_local_ctx){

    // If a specific value was positionned, apply it.
    if (in_el.d4_value) { 
      in_el.value = in_el.d4_value; 
      if (! in_ctx.$formdata) { return; }
    }

    if (in_local_ctx.default) { 
      in_el.value = in_local_ctx.default; 
    }

    let group = in_el.getAttribute("group");
    let prop  = in_el.getAttribute("name");
    this.dbg(`FFF Scanning (${in_el.tagName} - ${group || ''} - ${prop})`);
  // auto fill this form Elem ?
    if (in_ctx.$formdata)  {
      let fillwith = in_ctx.$formdata;
      if ( fillwith && typeof fillwith === "object" ) {
        let val = "";
        try {
          // Manage props that are build with "."
          prop.split(".").forEach( sub => {fillwith = fillwith[sub];});
          val = fillwith;

          // val = group ? (fillwith[group] ? fillwith[group][prop] : ""): fillwith[prop];
          if (typeof val === "undefined") val ="";
          // Special behavior for INPUT type = radio / check
          if (in_el.tagName == "INPUT" && (["radio", "checkbox"].indexOf(in_el.type.toLowerCase()) >=0 ) ) {
            if ( in_el.value == val )  {
              this.dbg(`FFF Applying CHECKED on ${val}`);
              in_el.checked = true;
            }
          } else {
            if (val) {
              this.dbg(`FFF Setting value to ${val}`);
              in_el.value = val;
            }
          }
        } catch (e) { 
          this.dbg("fff unable to find data");
        }
      }
    }

  }
  // JBIND handles Two-way DOM/VAR bindings.
  // Limited capacity... but enough for most situations.
  this.JBind = function (opt) {
      if ( ! opt.obj.__D4_bindmaps) {
        // Create a hidden property that will host binding refereneces.
        Object.defineProperty(opt.obj, "__D4_bindmaps", {enumerable : false, writable : true, value:{}})
      }
      if (! opt.obj.__D4_bindmaps[opt.prop]) {
        opt.obj.__D4_bindmaps[opt.prop] = {
          value : opt.obj[opt.prop],
          targets : []
        };
      }
      opt.obj.__D4_bindmaps[opt.prop].targets.push({bind_scope : opt.bind_scope, el : opt.el})
      var bindmap = opt.obj.__D4_bindmaps[opt.prop];


      // var bindmap =  {
      //     value : opt.obj[opt.prop],
      //     exp : opt.fqdn ,
      //     targets : []
      // };
      // bindmap.targets.push({bind_scope : opt.bind_scope, el : opt.el});


    // the bounded object has to be restructured so we can catch changes.
    Object.defineProperty( opt.obj, opt.prop, {
      get : function() { return bindmap.value; } , 
      set : function (val) {
        bindmap.value = val;
        // on set of a new value, propagate change to all bound DOM Elements
        bindmap.targets.forEach( (map, i) => {
          try{
            if (map.el.nodeName =="INPUT" && map.el.type=="radio") {
              if (map.el.value == opt.obj[opt.prop]) {
                  map.el.checked = true;
              }
              return
            }
            // Bind on directive
            if ( map.bind_scope[0] == ':' ) {
                // Can not work.... context is gone...
                // should rename expression with $, and apply it with current value
                 // like ==>  JNgine.fn( map.bind_scope.slice(1), '$', map.el, {$data: [opt.obj[opt.prop]]}, { } );
                // I keep it uncommented but...
                JNgine.fn( map.bind_scope.slice(1), '$', map.el, {$data: [opt.obj[opt.prop]], $errors:[]}, { } );
                 // JNgine.fn( map.bind_scope.slice(1), map.el.origDef[map.bind_scope], map.el, opt.ctx, { } );
            } else if (map.bind_scope[0] == '$') {
              map.el.setAttribute( map.bind_scope.slice(1), opt.obj[opt.prop] );
            } else if ( map.bind_scope == 'innerText' ) {
              // bind on text
              let origDef = map.el.origDef;
              let newText = origDef.replace(/{@{(.+?)}}/g, function (x, exp) {
                //return JNgine.processExpr(exp, opt.ctx, map.el, {});
                return opt.obj[opt.prop];
              });
              map.el.data = newText;
            } else {
              map.el[map.bind_scope] = val
              //JNgine.warn("Refresh for unHandled Property.");
            }
          } catch (e) {
            JNgine.warn("Unabled to propagate Bind for " + map.fqdn + " , iteration " + i);
            this.dbg(_this.bindmap);
          }
        });
      }
    });
    //Two way binding for INPUT and SELECT
    if (['INPUT','SELECT', 'TEXTAREA'].indexOf(opt.el.tagName) >=0 ) {
      let fn = (e) => {
        let el = e.currentTarget;
        if (el.nodeName =='INPUT' && el.type == "radio") {
          if (el.checked ) {
            opt.obj[opt.prop] = el.value;
          }
          return;
        }
        if (opt.obj[opt.prop] != opt.el.value){
          //console.log(" Input Changed to  :" + opt.el.value);
          opt.obj[opt.prop] = opt.el.value;
        }
      }
      opt.el.addEventListener('keyup', fn);
      opt.el.addEventListener('change', fn);     
    }
    
    return;
  }

  // ----------------------------------------------
  // Directives registries
  // Directives are called through   :  :mydirective=""
  this.fn_map = {};
  this.fn = function( in_dir_name, in_exp, in_el, in_ctx, in_local) {
    if ( isFn(this.fn_map[in_dir_name]) ) {
      try {
        if (in_el.origDef === undefined) { in_el.origDef = {} } 
        in_el.origDef[":"+in_dir_name]= in_exp; // save orig def
        return this.fn_map[in_dir_name].call(this, in_el, in_exp, in_ctx, in_local);
      } catch (e) {
        this.logErr(in_el, " WAR(" + in_dir_name + ") : Failed to execute directive " + e + ".\n Expr: " + in_exp, in_ctx);
      }
    } else {
      this.logErr(in_el, " ERR :Directive " + in_dir_name + " is not defined.\n Expr: " + in_exp, in_ctx);
    }
  }

})();

//----------------------------------------------------
JNgine.fn_map.innerText = function (in_el, in_exp, in_ctx, in_lctx) {
  let newText
  // Simple substitution
  newText = in_exp.replace(/{{(.+?)}}/g, (x, exp) => {
    let subst = "" ;
    try { subst = this.processExpr(exp, in_ctx, in_el ); } catch (e) {};
    return subst;
  });
  // Substitution with one way bindings.
  newText = newText.replace(/{@{(.+?)}}/g, (x, exp) => {
    let subst = "" ;
    try { subst = this.processExpr(exp, in_ctx, in_el, in_lctx); } catch (e) {};
    return subst;
  });

  // Specific handling of inner Text for TEXTAREA
  if (in_el.tagName == "TEXTAREA") {
    in_el.value = newText;
  } else {
    in_el.innerText = newText;
  }
}

//----------------------------------------------------
JNgine.fn_map.if = function (in_el, exp, ctx, in_lctx) {
  try  {
    if (!this.processExpr(exp, ctx, in_el, { bindScope : C_NOBIND } )) {
      in_el.remove();
      in_lctx["skipchilds"] = true;
      return false;
    }
    return true;
  } catch(e) { 
    in_el.remove();
    return false;
  }
}

//----------------------------------------------------
JNgine.fn_map["if-defined"] = function (in_el, exp, ctx) {
  try  {
    if (this.processExpr(exp, ctx, in_el, { bindScope : C_NOBIND }) === '') {
      return true;
    }
    in_el.remove();
    return false;
  } catch(e) { return false;}
}

//----------------------------------------------------
JNgine.fn_map["if-not"] = function (in_el, exp, ctx) {
  try  {
    if (this.processExpr(exp, ctx, in_el, { bindScope : C_NOBIND })) {
      in_el.remove();
      return false;
    }
    return true;
  } catch(e) { return true;}  
}

//----------------------------------------------------
// Remember reference to element  in $refs
JNgine.fn_map.ref = function (in_el, in_exp, in_ctx) {
  let expr = in_exp;
  let matchs = in_exp.match("{{(.*)}}");
  if (matchs) {
    expr = this.processExpr(matchs[1], in_ctx, in_el, { bindScope : C_NOBIND });
    this.dbg("map.ref from " + in_exp +"  gives " + expr);
  }
  if (in_ctx.$refs[expr] !== undefined) {
    // Will overwrite.
  }
  if (in_ctx.$instance_refs[expr] !== undefined) {
    this.dbg("map.ref  " + in_exp +"/"+ expr+" has already been declared in  this rendering session" );
  }
  in_ctx.$refs[expr] = in_el;
  in_ctx.$instance_refs[expr] = in_el;
  return true;
}

//----------------------------------------------------
// remember multiple references in array (multiple) (only within a rendering session)
JNgine.fn_map.refm = function (in_el, in_exp, in_ctx) {
  let expr = in_exp;
  let matchs = in_exp.match("{{(.*)}}");
  if (matchs) {
    expr = this.processExpr(matchs[1], in_ctx, in_el, { bindScope : C_NOBIND });
  }
  if (in_ctx.$instance_refs[expr] === undefined) {
    in_ctx.$refs[expr] = [];
    in_ctx.$instance_refs[expr] = [];
  }
  in_ctx.$refs[expr].push( (in_el) );
  in_ctx.$instance_refs[expr].push( (in_el) );
  return true;
}

//----------------------------------------------------
JNgine.fn_map["show-if"] = function (in_el, in_exp, in_ctx, in_lctx) {
  if (this.processExpr(in_exp, in_ctx, in_el, in_lctx)) {
    in_el.show();
  } else {
    in_el.hide();
  }
  return true;
}

//----------------------------------------------------
JNgine.fn_map["hide-if-not"] = function (in_el, in_exp, in_ctx, in_lctx) {
  if (this.processExpr(in_exp, in_ctx, in_el, in_lctx)) {
    if (in_el.style.display == "none") {
      in_el.style.display = "";
    }
  } else {
    in_el.style.display = "none";
  }
  return true;
}
//----------------------------------------------------
JNgine.fn_map["hide-if"] = function (in_el, in_exp, in_ctx, in_lctx) {
  if (!this.processExpr(in_exp, in_ctx, in_el, in_lctx)) {
    if (in_el.style.display == "none") {
      in_el.style.display = "";
    }
  } else {
    in_el.style.display = "none";
  }
  return true;
}



//----------------------------------------------------
JNgine.fn_map.repeat = function (in_el, in_exp, in_ctx, in_lctx) {
  // :repeat="expr"               , expr will be evaluated, and represents the number of times. Must be a number.
  // :repeat="expr as mycount"    where mycount is a variable representing the iteration number
  in_el.removeAttribute(":repeat");
  let repeatRE = /\s*(.*)\s+as\s*(\w+)\s*$/
  let tmp = in_exp.match(repeatRE);
  let count = 0, index_name;
  if (tmp) {
    count = this.processExpr(tmp[1], in_ctx, in_el, { bindScope : C_NOBIND });
    index_name = tmp[2];
  } else {
    count = this.processExpr(in_exp, in_ctx, in_el, { bindScope : C_NOBIND });
  }

  if (isNaN(count)) {
    this.logErr(in_el, " ERR(repeat) : Expects a numeric, got " + count + "\n Expr: " + in_exp, in_ctx)
    return false;
  }
  let i;
  for (i = 0; i < count; i++) {
    let new_el = in_el.cloneNode(true);
    if (index_name) {
      in_ctx.$render[index_name] = i;
    }
    in_el.parentNode.insertBefore(new_el, in_el);
    this.handleNode(new_el, in_ctx);
  }
  if ( in_ctx.$render[index_name]){
    delete  in_ctx.$render[index_name];
  }

  in_el.remove();
  return false;
}
//----------------------------------------------------
// Loops an EL (and childNodes) over an array, or an object values. 
// Usage :
// :for="section in sections"   (idx available with  section_idx)
// :for="line in lines"       (idx available with  line_idx)
// :for="section in getSections() limit 10"
JNgine.fn_map.for = function (in_el, exp, ctx, in_lctx) {
  var _this = JNgine;
  //in_el.removeAttribute(":foreach");
  // :for="section in sections"
  // :for="section in getSections()"
  // :for="section in getSections() limit 10"
  const forLimitExpRE = /^(.*)\s+limit\s+(\d+)$/;
  let limit_iteration = false;
  let z = exp.match(forLimitExpRE);
  if (z) {
    // Found a limitation statements. Save max iter value, and update expression.
    limit_iteration = z[2];
    exp = z[1].trim();
  }

  const forExpRE = /^(\w+)\s+in\s+(.+)$/;
  let t = exp.trim().match(forExpRE);
  if (!t) {
    this.logErr(in_el, " ERR(for) : No matching quote found.\n Expr: " + exp, ctx)
    return false;
  }

  let sourceList = JNgine.processExpr(t[2], ctx, in_el, in_lctx);
  let iteration_datas = [];
  let sourceIsObject = false;
  if (Array.isArray(sourceList)){
      iteration_datas = sourceList;
  } else  {
    // Try to see if it is an Object... ==> Iterate over Keys
    if (typeof sourceList === 'object' && sourceList !== null){
      Object.keys(sourceList).forEach((key) => { iteration_datas.push(sourceList[key]);});
      sourceIsObject = true;
    } else {
      this.logErr(in_el, " WAR(for) : source is neither an array nor an object " + sourceList + ". Setting to empty.\n Expr: " + exp, ctx);
    }
    //return;
  }

  let indexName = t[1];
  if (ctx.$render[indexName] !== undefined) {
    this.logErr(in_el, " WAR(for) : renderIndex " + indexName + " is currently  being used while rendering ==> overwrite.\n Expr: " + exp, ctx)
  }

  // Clone node to be repeated, and remove ":for" attribute
  let ref_el = in_el.cloneNode(true);
  ref_el.removeAttribute(":for");


  if (in_el.for_els === undefined)  {
    in_el.orig_disp = in_el.style.display ;
    in_el.for_els = [];
  } else {
    // means that we are refreshing the tree, upon var binding.
    // Remove previous iteration, and restore as initial
    in_el.style.display = in_el.orig_disp;
    in_el.for_els.forEach( (el, i) => {
      el.remove();
    });
    in_el.for_els=[];
  }

  // iterate on all elements... 
  iteration_datas.forEach((elem, i) => {

    if (limit_iteration && i >= limit_iteration){
      this.dbg("Reached limit of iterations. Stop");
      return true;
    }
    // Save contexte
    ctx.$render[indexName] = elem;
    ctx.$render[indexName + "_idx"] = sourceIsObject ? Object.keys(sourceList)[i] : i;
    // clone object, and append it right after
    let new_el = ref_el.cloneNode(true);

    in_el.parentNode.insertBefore(new_el, in_el);
    in_el.for_els.push( new_el );

    // process it.
    this.handleNode( new_el, ctx );
    // clean context so it won't conflict
    delete ctx.$render[indexName];
    delete ctx.$render[indexName + "_idx"];
  });

  //finally, remove ref dom_el.
  in_el.remove();

  // return false because nothing more to be done on the reference element.
  return false;
}

//----------------------------------------------------
// handler directive allows management of an element outside of  Ngine.
// child of that elements won't be processed by NGine !!!!
// If you to process AFTER the handling, use "handler-continue"
// If you wan't to apply an handler AFTER Ngine Rendering, use "posthandler"
// usage : :handler="myFunction"
// usage : :handler="myFunction($.a, $.b)" // (myFunc will be called with in order ($.a, $.b, in_el, in_ctx)
// usage : :handler="myFunction with $.a, $.b" // deprecated, same as myFunction($.a, $.b), but called with(in_el, $.a, $.b, in_ctx)
JNgine.fn_map.handler = function (in_el, in_exp, in_ctx,in_lctx) {

    // Should the handler function be called with explicit params? 
    let withRE = /^(\w+)\s+with\s+(.+)\s*$/;
    let hdl_func;
    let params = [in_el];
    let m = in_exp.match(withRE);
    if ( m ) {
      this.log(":handler: statements under the form of  myfunc with $.a, $.b are DEPRECATED");
      hdl_func = this.processExpr( m[1], in_ctx, in_el, { bindScope : C_NOBIND });;
      m[2].split(",").forEach( m_exp => {
        params.push(this.processExpr(m_exp, in_ctx, in_el, { bindScope : C_NOBIND }));
      });
      
    } else {
      // Fix 2021-05-09
      hdl_func = this.processExpr(in_exp, in_ctx, in_el, { bindScope : C_NOBIND });
      if (typeof hdl_func !== "function" &&  ! /.*\)\s$/.test(in_exp)) {
      this.logErr(in_el, " WAR(handler) : " + in_exp + " is not a callable function(2).\n Expr: " + in_exp, in_ctx);
        // End there.
        // return false;
      }

    }
    params.push(in_ctx);

  // DO NOT BIND with this directive
  if (typeof hdl_func !== "function"){
    this.logErr(in_el, " WAR(handler) : " + in_exp + " is not a callable function.\n Expr: " + in_exp, in_ctx);
  } else {
    // Execute handler now 
    //hdl_func.call(in_ctx.$app, in_el, in_ctx);
    hdl_func.apply(in_ctx.$app, params);
  }
  return false; // return false to prevent content management by JNgine
}

//----------------------------------------------------
// handler directive allows management of an element outside of the Ngine.
// But processing of child nodes will continue
JNgine.fn_map["handler-continue"] = function (in_el, in_exp, in_ctx,in_lctx) {
  this.fn("handler", in_exp, in_el, in_ctx,in_lctx);
  return true;
}

//----------------------------------------------------
// Sets a default value to be used input forms element
// This default value will be applied at the end of the form element processing 
// (cause "select" values are hold in child nodes "option")
JNgine.fn_map.default = function (in_el, in_exp, in_ctx,in_lctx) {
  in_lctx.default = this.processExpr(in_exp, in_ctx, in_el, in_lctx);
  return true;
}

//----------------------------------------------------
JNgine.fn_map.focus = function (in_el, in_exp, in_ctx) {
  in_ctx.$focus = in_el;
  return true; // continue
}

//----------------------------------------------------
// Call a handler post processing of the element and childs.
// format : :posthandler="someFunction($.myvar)"
// Do NOT use this there, not required since the call will be immediately executed, knowing current rendering context.
JNgine.fn_map.posthandler = function (in_el, in_exp, in_ctx, in_lctx) {
  //in_lctx.posthandler = this.processExpr(in_exp, in_ctx, in_el, in_lctx);
  in_lctx.posthandler = in_exp;
  
  return true; // continue
}

//----------------------------------------------------
// Format  : <form :formdata="MyFormObject"  (DATAS = Object)
// Will try to fill the form with values found in MyFormObject matching name/propertyName.
JNgine.fn_map.formdata = function (in_el, in_exp, in_ctx, in_lctx) {
  in_lctx["formdata"] = this.processExpr(in_exp, in_ctx, in_el, in_lctx);
  in_ctx.$formdata = in_lctx["formdata"];
  return true; // continue
}

//----------------------------------------------------
// Format  : <div :includetpl="mytpl_root_elem_id"
// Format  : <div :includetpl="{{var_to_tpl_id}}"    , with var_to_tpl_id = id of the template node
// Format  : <div :includetpl="sometemplate with $"     then the template will be executed, and its $data context will have $ 
JNgine.fn_map.includetpl = function (in_el, in_exp, in_ctx, in_lctx) {
  let tmp = in_exp.match(/{{(.*)}}/) ; 
  if (tmp) {
    in_exp = this.processExpr(tmp[1], in_ctx, in_el, in_lctx);
  }

  // Clear this node content
  while (in_el.firstChild) {
    in_el.removeChild(in_el.firstChild);
  }
  // set val for post processing
  in_lctx["includetpl"] = in_exp;
  return true; // continue
}
//----------------------------------------------------
// Format  : <div :addattr-if="when $1 then $2 = $3"
// $1 = condition
// $2 = name of the attr, will be interpreted as string (do not quote), 
// $3 = Value to be assigned ( will be processed)
JNgine.fn_map["addattr-if"] = function (in_el, in_exp, in_ctx, in_lctx) {
  const checkRE = /when (.+) then (\w+)=(.+)/; 
  let exp_mber = in_exp.match(checkRE);
  if (exp_mber) {
    try {
      if (this.processExpr(exp_mber[1], in_ctx, in_el, in_lctx)) {
        in_el.setAttribute(exp_mber[2], this.processExpr(exp_mber[3], in_ctx, in_el, in_lctx));
      }
    } catch (e) {
      this.logErr(in_el, " WAR(addattr-if) : Process Failed.\n Expr: " + in_exp, in_ctx)
    }
  } else {
    this.logErr(in_el, " WAR(addattr-if) : Invalid expression.\n Expr: " + in_exp, in_ctx)
  }

  return true; // continue
}
//----------------------------------------------------
JNgine.fn_map["addclass-if"] = function (in_el, in_exp, in_ctx, in_lctx) {
  const checkRE = /when (.+) then (.+)/;
  let exp_mber = in_exp.match(checkRE);
  if (exp_mber) {
    if (this.processExpr(exp_mber[1], in_ctx, in_el, in_lctx)) {
      let  newval= this.processExpr(exp_mber[2], in_ctx, in_el, in_lctx);
      if (newval){
        in_el.classList.add(newval);
      }
    }
  } else {
    this.logErr(in_el, " WAR(addclass-if) : Invalid expression.\n Expr: " + in_exp, in_ctx)
  }

  return true; // continue
}

//----------------------------------------------------
// CSS styles to be defined in JS Manner (ie backgroundColor instead of "background-color");
// Support multiple definition, separated with ","
// ex:    :set-css="backgroundColor=cond.color,color='white'"
//
JNgine.fn_map["set-css"] = function (in_el, in_exp, in_ctx, in_lctx) {
  let setRE = /^([a-z-A-Z]*)\s*=\s*(.*)$/ 
  in_exp.split(",").forEach( sub_exp => {
    let t = sub_exp.trim().match(setRE);
    if (t && t[1]) {
      in_el.style[t[1]] = this.processExpr(t[2], in_ctx, in_el, in_lctx);
    } else {
      this.logErr(in_el, " WAR(set-css) : Invalid Expression.\n Expr: " + sub_exp, in_ctx)
    }
  })
  
  return true; // continue
}



//----------------------------------------------------
/*
Within a tab domain, there will be tabs that will activate specific views /actions.
A tab is composed of 1 or several "panel", that is a "button" or whatever allowing selection
  and 0 or 1 body, that will be shown over the others upont selection.
  there might be no body, for example in case of a action list
  When selecting a tab panel, a specific function can be called, that will receive as inputs the name of the tab.
  A tab name/body can be triggered by sthg else that its name, through the directive ":tab_nav_to".
  It has to be called within the tab domain, meaning that the DOM EL must be on the child tree of the EL associated with the tab domain.
*/

JNgine.fn_map.tabs_domain = function (in_el, in_exp, in_ctx, in_lctx) {
  return JNgine.fn_map.tab_init(in_el, in_exp, in_ctx, in_lctx);
}

//-----------------------------------
JNgine.fn_map.tab_init = function (in_el, in_exp, in_ctx, in_lctx) {
  // default tab object
  var tab_cfg = {
    name: in_exp,
    root_el: in_el,
    style: 'selected', // default style
    default_active: false,
    tab_panels: {
            /*  name : {
                    title_el,
                    content_el :,
                    (o) cb_fn,
                    (o) cb_params 
                }   */},
    title_els: [],
    content_els: [],
    current_active : null,

    // !!!!!   Do not use () =>  ! Use function() to preserve local this context
    navTo: function (in_tab_name, e) {  //  !!! USE FUNCTION() not ()=> !!!! 
      if (in_tab_name == "__SHOW_ALL__" ){
        // special key words to activate all tabs.
        this.title_els.forEach( e => { e.classList.add(this.style); });
        this.content_els.forEach( e => { e.classList.remove("tab_body_inactive"); });
        this.current_active = in_tab_name;
        return;
      }

      // Check existence of target tab
      if (! this.tab_panels[in_tab_name]) {
        console.warn("Tab Not found");
        return;
      }

      // If current active tab has an onleave callback
      if (this.current_active && in_tab_name !== this.current_active && this.tab_panels[this.current_active].on_leave_fn) {
        this.tab_panels[this.current_active].on_leave_fn.apply(in_ctx.$app,[]);
      }

// clear selection of them all
      this.title_els.forEach((e) => { e.classList.remove(this.style); });
      this.content_els.forEach((e) => { e.classList.add("tab_body_inactive"); });

      let tab = this.tab_panels[in_tab_name];
      // activate select on header
      if (tab.title_el) {
        tab.title_el.classList.add(this.style);
      }
      // activate select on content
      if (tab.content_el) {
        this.current_active = in_tab_name;
        tab.content_el.classList.remove("tab_body_inactive");
      }
      // If a trigger CB function has been defined
      if (tab.cb_fn) {
        let args = [];
        tab.cb_params.forEach( cbparam => { args.push(cbparam)} )
        args.push(in_tab_name);
        args.push(tab);
        args.push(e);
        tab.cb_fn.apply(in_ctx.$app, args);
      }
    }
  };

  // 
  try {
    // Can not reuse Const definition here...
    const isObjectRE = /^\{(.*?)\}$/;
    if (isObjectRE.test(in_exp)) {
      let opt = this.processExpr(in_exp, in_ctx, in_el, in_lctx);
      if (typeof opt == "object") {
        tab_cfg.name = opt.name;
        tab_cfg.default_active = opt.default;
        tab_cfg.style = opt.style;
        this.log("OK Object found");
      } else {
        tab_cfg.name = in_ctx;
      }
    }
  } catch (e) {
    tab_cfg.name = in_ctx;
  }

  in_el.tab_props = tab_cfg;
  in_ctx.$tabs[tab_cfg.name] = tab_cfg;
  in_ctx.$parent_tab = in_ctx.$cur_tab;
  in_ctx.$cur_tab = tab_cfg;

  // save in local handleNode context info for postprocessing.
  in_lctx["tabs_domain"] = tab_cfg.name;
  return true;
}

//----------------------------------------------------------------------
JNgine.fn_map.tab_default_active = function (in_el, in_exp, in_ctx, in_lctx) {
  let tmp = in_exp.match(/{{(.*)}}/) ; 
  if (tmp) {
    in_exp = this.processExpr(tmp[1], in_ctx, in_el, in_lctx);;
  }
  in_ctx.$cur_tab.default_active = in_exp;
  return true;
}

//----------------------------------------------------------------------
// handle new nav_tab
JNgine.fn_map.tab_name = function (in_el, in_exp, in_ctx, in_lctx) {

  let $tab = in_ctx.$tabs[in_ctx.$cur_tab.name];
  let hasTriggerRE = /(.*)\s+triggers\s+(.*)/;

  let t_name = in_exp;
  let cb, cb_params =[];
  // Check if tab selection shall trigger a function
  let t = in_exp.trim().match(hasTriggerRE);
  if (t) {
    // Extract first part of the statement, but don't do anything : will be handled later.
    t_name = t[1]; 

    // the 2nd part could be either: 
    //   - cb_fun_name
    //   - cb_fun_name with a,'b',c  (args)
    let cb_expr = t[2].trim();
    let checkEventExprRE = /^(\w+)\s+with\s+(.+)\s*$/; //  "myfct with var1,'txt2'"
    let ev_exp = cb_expr.match(checkEventExprRE);
    if (ev_exp) { //      : @tab_name=toto_tab triggers manageToto with i,'ok'  ==> Will call manageToto with contexte data
      cb = this.processExpr( ev_exp[1], in_ctx, in_el, in_lctx);

      // parse vars.
      ev_exp[2].split(",").forEach( (p)  =>  {
        // interpret parameter at rendering time.
        cb_params.push(this.processExpr(p, in_ctx, in_el, in_lctx));
      });
    } else if (cb_expr.match(/^(\w+)$/)) {
      cb = this.processExpr( cb_expr, in_ctx, in_el, in_lctx);
    } else {
      this.logErr(in_el, " ERR : tab_name : Could not identify cb fn .\n Expr: " + in_exp, in_ctx);
      return;
    }
  }

  // should we process t_name (tab_identifier)?
  t = t_name.match(/{{(.*)}}/);
  if (t){
    t_name = this.processExpr(t[1], in_ctx, in_el, in_lctx);
  }

  // Declaration of the title panel.
  if ($tab.tab_panels[t_name] === undefined) {
    $tab.tab_panels[t_name] = {};
  }
  $tab.tab_panels[t_name].title_el = in_el;

  if (typeof cb == "function") {
    $tab.tab_panels[t_name].cb_fn = cb;
    $tab.tab_panels[t_name].cb_params = cb_params;
  }
  $tab.title_els.push(in_el);

  if ($tab.default_active == t_name || $tab.default_active == "__SHOW_ALL__") {
    // set tab-nav active.
    in_el.classList.add($tab.style);
  }
  in_el.addEventListener('click', function (e) {
    $tab.navTo(t_name, e);
  });
  return true;
}
//-----------------------------------
//-----------------------------------
// handle new body tab
// Usage : :ref_tab_name="tab"
JNgine.fn_map.ref_tab_name = function (in_el, in_exp, in_ctx, in_lctx) {
  let $tab = in_ctx.$tabs[in_ctx.$cur_tab.name];

  // should we process t_name?
  var t_name = in_exp.trim();
  var t = t_name.match(/{{(.*)}}/);
  if (t){
    t_name = this.processExpr(t[1], in_ctx, in_el, in_lctx);
  }

  in_el.classList.add("d4_tab");
  in_el.d4_tab_group = in_ctx.$cur_tab.name;
  in_el.d4_tab_name = t_name;

  // Declaration of the title panel.
  if ($tab.tab_panels[t_name] === undefined) {
    $tab.tab_panels[t_name] = {};
  }
  $tab.tab_panels[t_name].content_el = in_el;
  $tab.content_els.push(in_el);

  // is it the default active?
  if ($tab.default_active != t_name && $tab.default_active != "__SHOW_ALL__") {
    in_el.classList.add("tab_body_inactive");
  } else {
    // If the tab has a trigger, execute it
    $tab.navTo(t_name);
  }

  return true;
}

//----------------------------------------------------
// This attribute will add a Click event Handler to navigate to targeted tab
// ex :tab_nav_to="myHomeTab"
JNgine.fn_map.tab_nav_to = function (in_el, in_exp, in_ctx, in_lctx) {
  let $tab = in_ctx.$tabs[in_ctx.$cur_tab.name];
  in_el.addEventListener('click', function (e) {
    $tab.navTo(in_exp, e);
  });
  return true;
}
//----------------------------------------------------------------------
// handle new nav_tab
JNgine.fn_map.tab_on_leave = function (in_el, in_exp, in_ctx, in_lctx) {

  let $tab = in_ctx.$tabs[in_ctx.$cur_tab.name];
  // Search current tab...
  try {
    let [target, config] = Object.entries($tab.tab_panels).find(([name, cfg]) => cfg.title_el === in_el)
    if (! target ) {
      this.logErr(in_el, " WAR(tab_on_leave) : Unable to determine targeted tab.\n Expr: " + in_exp, in_ctx)
      throw new Error();
    }
    let on_leave_fn = this.processExpr(in_exp, in_ctx, in_el, in_lctx);
    if ( typeof on_leave_fn  !== "function") {
      this.warn(" WAR(tab_on_leave) : Target is unresolved or not a function.\n Expr: " + in_exp, in_ctx)
    }
    config.on_leave_fn = this.processExpr(in_exp, in_ctx, in_el, in_lctx);
  }   catch(e) {
    this.logErr(in_el, " WAR(tab_on_leave) : Unable to process.\n Expr: " + in_exp, in_ctx)
  }

  return true;
}
//----------------------------------------------------
// set a Render context variable at rendering time 
// that can be refered to when rendering.
JNgine.fn_map.setcontextvar = function (in_el, in_exp, in_ctx, in_lctx) {
  let setRE = /^(\w+)\s*=\s*(.*)$/;
  let t = in_exp.match(setRE);
  if (t) {
    in_ctx.$render[t[1]] = this.processExpr(t[2], in_ctx, in_el, in_lctx);
  } else {
    this.logErr(in_el, " WAR(setcontextvar) : Invalid expression.\n Expr: " + in_exp, in_ctx)
  }

  return true;
}

//----------------------------------------------------
// set a Render context variable refering to current element.
// Will be available all throug the rendering process 
// ex =  <div :setcontext="mydivel">
JNgine.fn_map.setcontextel = function (in_el, in_exp, in_ctx, in_lctx) {
  let setRE = /^(\w+)$/;
  let t = in_exp.match(setRE);
  if (t) {
    in_ctx.$render[t[1]] = in_el;
  } else {
    JNgine.logErr(in_el, " WAR(setcontextel) : Invalid expression.\n Expr: " + in_exp, in_ctx)
  }

  return true;
}
//----------------------------------------------------
JNgine.fn_map.hide = function (in_el, in_exp, in_ctx, in_lctx) {
  in_el.style.display="none";
  return true;
}

//----------------------------------------------------
// add a toggle behavior
JNgine.fn_map.toggle = function (in_el, in_exp, in_ctx, in_lctx) {
  let $refs = in_ctx.$refs;
  in_el.style.cursor = "pointer";

  let expr = in_exp;
  let matchs = in_exp.match(/{{(.*)}}/);
  if (matchs) {
    expr = this.processExpr(matchs[1], in_ctx, in_el, { bindScope : C_NOBIND });
    this.dbg("map.ref slideto from " + in_exp +"  gives " + expr);
  }


  if (expr == "this") {
    in_el.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      in_el.toggle();
    });
    return true;
  }
  in_el.addEventListener("click", function (e) {
    e.preventDefault();
    e.stopPropagation();
    let refs = expr.split(",");
    refs.forEach( ref => {
      if  ( $refs[ref] ) { 
        $refs[ref].toggle();
      }
    });
  });
  return true;
}


//----------------------------------------------------
// add a click event handler that will toggle the el (which must be previouslt set with :ref=)
// ex : <div :ref="my_ref"> <div :toggleref="my_ref">
// ex : <div :ref="my_ref1"> <div :ref="my_ref2"> <div :toggleref="my_ref1,my_ref2">
JNgine.fn_map.toggleref = function (in_el, in_exp, in_ctx) {
  in_el.style.cursor = "pointer";
  let refs = [];
  in_exp.split(",").forEach( e => {
    let ref = in_ctx.$refs[e.trim()];
    if (!ref ) {
      JNgine.logErr(in_el, ` WAR(toggleref) : Reference ${e} non trouvée .\n Expr:  ${in_exp}`, in_ctx);
      return true;
    } else { refs.push(ref);}
  });
  in_el.addEventListener("click", function (e) {
    e.preventDefault();
    e.stopPropagation();
    refs.forEach( ref_el => ref_el.toggle());
  });
  return true; // continue
}

//----------------------------------------------------
// trigger a function defined in_exp if a click occurs "outside" in_el
JNgine.fn_map.onoutsideclick = function (in_el, in_exp, in_ctx) {
  if (! JNgine.closeOnOutsideClickMap ) { 
    JNgine.log("Registering closeOnOutsideClickMap");
    JNgine.closeOnOutsideClickMap = [];
    document.addEventListener('click', (event) => { 
      let maps =  this.closeOnOutsideClickMap;
      for( let i = 0; i <  maps.length; i++){ 
        if (  ! maps[i].el.isConnected) { maps.splice(i, 1); i--; continue;}
        if ( ! event.composedPath().includes(maps[i].el)) {
          //JNgine.log("Trigger! ");
          maps[i].cb.call(maps[i].ctx$app);
        }
      }
    });
  }
  JNgine.closeOnOutsideClickMap.push({ el : in_el, ctx$app : in_ctx.$app, cb : JNgine.processExpr(in_exp, in_ctx)} );
 
  return true; // continue
}
