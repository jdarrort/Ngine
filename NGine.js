/*********************************************************************************
    (c) Copyright 2018 - JDA IT Solutions - Julien Darrort . All rights reserved.
**********************************************************************************/
/*
    Description :  Rendering processor
    New Engine.
    Inspired by other frameworks, angular/vue. Only for the rendering abilities.
    Limited scope of functionalities...
     Warning, source data provided may be altered by custom functions  (no data copies)
     Expression will look for data in this order
     1/ in current rendering context (variables created at render time)
     2/ in specific context data provided in StartRender
     3/ in core app provided. 
*/

// For EDGE compatibility
if (Element.prototype.getAttributeNames == undefined) {
    Element.prototype.getAttributeNames = function () {
      var attributes = this.attributes;
      var length = attributes.length;
      var result = new Array(length);
      for (var i = 0; i < length; i++) {
        result[i] = attributes[i].name;
      }
      return result;
    };
}
//------------------------------------------------------
//------------------------------------------------------
// UTility function to copy a NodeList collection to another DOM target.
NodeList.prototype.appendTo = function( in_target_el ) {
    let target_el = in_target_el;
    if (in_target_el instanceof jQuery) { target_el = in_target_el[0]; }
    while( this.length ) { target_el.appendChild(this[0]); }
}
Element.prototype.appendTo = function( in_target_el ) {
    let target_el = in_target_el;
    if (in_target_el instanceof jQuery) { target_el = in_target_el[0]; }
    target_el.appendChild(this);
}
Element.prototype.toggle = function( ) {
    if (this.style.display == "none") {
        this.style.display = this._default_display || "block";
    } else {
        this._default_display = this.style.display ;
        this.style.display = "none";
    }
}
Element.prototype.clear = function( ) { 
    this.innerHTML = ""; return this;
}
Element.prototype.html = function( in_html_content) { 
    if (typeof in_html_content === "string" ) {this.innerHTML = in_html_content;}  
    return this.innerHTML;
}
Element.prototype.show = function( ) {
    if (this.style.display == "none" || this.style.display == "") {
        this.style.display = this._default_display || "block";
    }
    return this;
}
Element.prototype.hide = function( ) {
    if (this.style.display != "none") {
      this.toggle();
    } 
    return this;
}   
Element.prototype.val = function( val) { 
    if (val) { this.value = val; }
    return this.value;  
}
Element.prototype.css = function( style, val) { 
    this.style[style] = val;
    return this;
}
  // Does not work
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
    var _this =this;
    'use strict';
    // Determine structure
    const isFuncRE = /^(\w+)\((.*)\)$/;
    const isVarRE = /^\s*(\${0,1}[a-zA-Z0-9_.]+)\s*$/; // return a var 
  
    // accept toto.tata, toto, $.tata , #.tata, my_var1[my_var2].prop1
    //const isVarRE2 = /^\s*(\${0,1}[a-zA-Z0-9_.\[\]]+)\s*$/; // var that may refrence an object // like    my_var1[my_var2].prop1
  //  const isVarRE2 = /^\s*(((\$\.){0,1}|(\#\.){0,1})[a-zA-Z0-9_.\[\]]+)\s*$/; // var that may refrence an object // like    my_var1[my_var2].prop1
    const isVarRE3 = /^\s*(((\$\.){0,1}|(\#\.){0,1})[a-zA-Z0-9_.\[\]\(\)]+)\s*$/; // var that may refrence an object // like    my_var1[my_var2].prop1, myobj.toUpperCase()
    const isVarRE3_g = /(((\$\.){0,1}|(\#\.){0,1})[a-zA-Z0-9_.\[\]\(\)]+)/g; 
  
    const isStringRE = /^['|"](.*)["|']$/;  // ex "'toto'" ou "'  43434 " 
    const isNumRE = /^\s*(\d+)\s*$/;
    const isExpressionRE = /{{.*}}/;  // not sufficient to know what to do, but at least tells if sthg to do.
    const isExpressionRE2 =  /{@{0,1}{.+}}/;  // 
   
    const isComplexExpRE = /[^\w.$]/; // matchs anything that is not a one word  or a var exp (like a.b) ... not ready....
    const isObjectRE = /^\{(.*?)\}$/;
  
    const isSpecialAttrRE = /^[:|@|\$]/; // begins with one of the specials
  
    const checkEventExprRE = /^(\w+)\s+with\s+(.+)\s*$/; //  "myfct with var1,'txt2'"
  
  
    this.dbg  = function (txt) { console.debug("[Ngn] " + txt); }
    this.log  = function (txt) { console.log("[Ngn] " + txt); }
    this.warn = function (txt) { console.warn("[Ngn] " + txt); }
    this.err  = function (txt) { console.error("[Ngn] " + txt); }
  
    this.watched_expr=[];
  
    this.RenderTemplateTo = function(in_tpl_id, in_app, in_data, in_target_el){
      let target_el = in_target_el;
      if (in_target_el instanceof jQuery) {
        target_el = in_target_el[0];
      };
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
    // Clone an ID-ed template,return rendered clone.
    // Returns  ChildNodes collection and context data.
    // ==================================================
    this.RenderTemplate = function(in_tpl_id, in_app, in_data){
      var el_tpl = document.getElementById( in_tpl_id );
      if ( ! el_tpl ) {
          this.warn("Template not found : " + in_tpl_id );
          return;
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
      var b_zTag = false;    
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
        let pre_directives = el_attrs.filter( a => ([":pause", ":if", ":if-defined", ":for", ":repeat", ":tabs_domain", ":default"].indexOf(a) >=0 ) );
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
            local_ctx.bindScope =  attr_name; //  $aaa ==> aaa
          } 
          // Compute target attr_val
          try {
            attr_val = this.processExpr(attr_val, in_ctx, in_el, local_ctx) || "";
          } catch (e) {attr_val = ""}
          // Specific processing for SELECT and attribute "value"
          //  <option>  being defined afterwards, must position value in postprocessing.
          if (in_el.nodeName =="SELECT" && attr_name == "value"){
            in_el.d4_value = attr_val;
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
            local_ctx.bindScope =  ":" + attr_name; //  $aaa ==> aaa
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
              return subst
            });
            // Substitution with one way bindings.
            new_text = new_text.replace(/{@{(.+?)}}/g, function (x, exp) {
              node.origDef = node.origDef  || new_text;
              let subst="";
              try { subst = JNgine.processExpr(exp, in_ctx, node, {bindScope : "innerText"} ); } catch(e) {}
              return subst
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
          if (typeof local_ctx["posthandler"] == "function"){
            // execute posthandler func
            local_ctx["posthandler"].call( in_ctx.$app, in_el);
          } else {
            this.logErr(in_el, " WAR( posthandler ) : Providden expr is not a function.\n Expr: " + in_exp, in_ctx);
          }
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
  
  
        // Specific processing for "<Z>" elements.
        // Must be done at the very end.
        if (in_el.tagName == "Z" || in_el.tagName == "Z-SILENT") {
            // move each child Node just before the Z tag.
            while (in_el.childNodes.length){
              in_el.parentNode.insertBefore(in_el.childNodes[0], in_el);
            }
          in_el.remove(); // Remove "<z>" tags, childNodes would have been moved just before
        }
  
      } catch (e){
        this.warn ("went wrong here....");
      }
  
      // process finalized.
    } // handleNode
  
  
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
        cb_fn_name = in_exp;
      } else {
        let ev_exp = in_exp.match(checkEventExprRE);
        if (ev_exp) { //      : @click=manageToto with i,'ok'  ==> Will call manageToto with contexte data
          cb_fn_name = ev_exp[1];
  
          // parse vars.
          ev_exp[2].split(",").forEach(function (p, i) {
            // interpret parameter at rendering time.
            cb_params.push(this.processExpr(p, in_ctx, in_el, in_lctx));
          }, this);
        } else {
          _this.logErr(in_el, " ERR : Could not identify fn ctx.$app (2) .\n Expr: " + in_exp, in_ctx);
          return;
        }
      }
      // check existence : 
      if (typeof in_ctx.$app[cb_fn_name] !== "function") {
        this.logErr(in_el, " ERR : callback " + cb_fn_name + " is not a definied function in current  ctx.$app .\n Expr: " + in_exp, in_ctx);
        return;
      }
  
      if (["click", "contextmenu", "dblclick"].indexOf(in_event) >=0 ) {
        in_el.style.cursor = "pointer";
      }
  
      in_el.addEventListener(in_event, function (e) {
        if (stop_propagation) {
          e.preventDefault();
          e.stopPropagation();
        }
        let call_params = cb_params.concat([e]);
        in_ctx.$app[cb_fn_name].apply( in_ctx.$app, call_params);
      });
    }
    //-----------------------------------------
    // Search among ctx $data for matching attribute (respecting context order)
    this.getValueFromDataContext = function (in_exp, in_ctx) {
      let membs = in_exp.split(".");
      // Try to find first member of expression in one of the data context
      let first_member = membs.shift();
      // let selected_ctx_data = in_ctx.$data.find( cd => ( Object.keys(cd).indexOf(first_member) >= 0) );
      // Include non iterable attribuutes, like .length
      let selected_ctx_data = in_ctx.$data.find( cd => ( Object.keys(cd).indexOf(first_member) >= 0 || (typeof cd ==="object" && typeof cd[first_member] !== "undefined")) );
      if (!selected_ctx_data) {
        return undefined; 
      }
      selected_ctx_data = selected_ctx_data[first_member];
      // Then browse the selected tree object 
      let i = 0;
      for (i = 0; i < membs.length; i++){
        // Special handling for functions;
        let func_tmp = membs[i].match(isFuncRE);
        if (func_tmp) {
          let fct_name = func_tmp[1];      
          return selected_ctx_data[fct_name].call(selected_ctx_data);
        } else {
          selected_ctx_data = selected_ctx_data[membs[i]];
        }      
        if (typeof selected_ctx_data ==="undefined") return undefined;
      }
      return selected_ctx_data;
    }
    // //-----------------------------------------
    // // Search among ctx $data for matching attribute (respecting context order)
    // this.getValidDataContext = function (in_member, in_ctx) {
    //   return in_ctx.$data.find( cd => ( Object.keys(cd).indexOf(in_member) >= 0) );
    // }
  
    //-----------------------------------------
    // Preprocessor function to process sub statements of type function, and replace it 
    // Useless....
    this.extractInFunction = function( in_exp, in_ctx, in_el) {
      let statements = [];
      let openings = [];
      let target_expr = in_exp;
      for (i in in_exp) { 
          switch(in_exp[i]) {
              case '(' :
                  //console.log(`Found opening at : ${i}, depth : ${openings.length}`)
                  openings.unshift(parseInt(i));
                  break;
              case ')' :
                  //console.log(`Found closing at : ${i}, depth : ${openings.length -1}`)
                  if (!openings.length) { 
                    console.warn("closing parenthesis, without opening at " + i);
                    throw new Error();
                  }
                  openings[0].end_at = i;
                  let statement = in_exp.slice(openings[0] + 1, i );
                  if (openings.length == 1  && statement.trim() != "") {
                    // Process_expr
                    try {
                      let replacement = this.processExpr(statement, in_ctx, in_el);
                      replacement = isNaN(Number(replacement)) ?  `'${replacement}'` : replacement;
                      // this.dbg(`SubFnExpr : Replacing ${statement}  => '${replacement}'`)
                      target_expr = target_expr.replace(new RegExp(statement), replacement);
                      // this.dbg(`SubFnExpr : Statement will be  ${target_expr}`)
                    } catch (e) {
                      this.warn(`SubFnExpr ${statement} could not be interpreted`)
                      throw e;
                    }
                  }
                  openings.shift();
                  break;
          }
      }
      return target_expr;
    }
    //-----------------------------------------
    // Preprocessor function to process sub statements of type function, and replace it 
    this.maskInFunctionStatements = function( in_exp, fn_statements=[]) {
        let statements = [];
        let openings = [];
        let processed_exp = in_exp;
        for (i in in_exp) { 
            switch(in_exp[i]) {
                case '(' :
                    //console.log(`Found opening at : ${i}, depth : ${openings.length}`)
                    openings.unshift(parseInt(i));
                    break;
                case ')' :
                    //console.log(`Found closing at : ${i}, depth : ${openings.length -1}`)
                    if (!openings.length) { 
                      console.warn("closing parenthesis, without opening at " + i);
                      throw new Error();
                    }
                    openings[0].end_at = i;
                    let statement = in_exp.slice(openings[0] + 1, i );
                    if (openings.length == 1  && statement.trim() != "") {
                        processed_exp = processed_exp.replace(statement, "");
                    }
                    fn_statements.push(statement);
                    openings.shift();
                    break;
            }
        }
        return processed_exp;
      }
    
    //-----------------------------------------
    // Preprocessor function to process sub statements of type function
    
    this.extractInBrackets = function( in_exp, in_ctx, in_el) {
      let openings = [];
      let target_expr = in_exp;
      for (i in in_exp) { 
          switch(in_exp[i]) {
              case '[' :
                  //console.log(`Found opening at : ${i}, depth : ${openings.length}`)
                  openings.unshift(parseInt(i));
                  break;
              case ']' :
                  //console.log(`Found closing at : ${i}, depth : ${openings.length -1}`)
                  if (!openings.length) { 
                    this.warn(`closing parenthesis, without opening at ${i}, exp : ${in_exp}`);
                    throw new Error();
                    continue;
                  }
                  openings[0].end_at = i;
                  let statement = in_exp.slice(openings[0] + 1, i );
                  if (openings.length == 1 ) {
                    // Process_expr
                    try {
                      let replacement = this.processExpr(statement, in_ctx, in_el);
                      if (  ["number","string"].indexOf(typeof  replacement) == -1) { 
                          this.warn(` In bracket statement ${statement} returns an invalid object type ${typeof replacement} `);
                          throw new Error("waza");
                      }
                      // this.dbg(`SubBkExpr : Replacing ${statement}  => ${replacement}`)
                      target_expr = target_expr.replace("["+statement+"]", "."+replacement);
                      // this.dbg(`SubBkExpr : Statement will be  ${target_expr}`)
  
                    } catch (e) {
                      this.warn(`SubBkExpr ${statement} could not be interpreted`)
                      throw e;
                    }
                  }
                  openings.shift();
                  break;
          }
      }
      return target_expr;
    }  
    //-----------------------------------------
    // $ ==> Refer to context data passed to Ngine
    // # ==> Refer to the caller data from the  calling object ()
    // @ ==> Refer to a data built at rendering time within Ngine
    this.processExpr = function (in_exp, in_ctx, in_el, in_lctx = { bindScope : C_NOBIND }) {
      let exp = in_exp.trim();
      var _this = this;
      let res;
      //  if (typeof in_lctx == "undefined") in_lctx = { bindScope : C_NOBIND };
      // determine expression type.
  
      if (exp == "$") {
        if (in_ctx.$data.length > 1) {
          this.warn("Expr $ while cumulated $data contexts found... Returning current context")
        }
        return in_ctx.$data[0]; // Returns current data context ... maybe not perfect
      }
      
      // special chars 
      //@xxx designates to an instance reference.
      if (exp[0] == "@") {
        let cur_exp = exp.slice(1);
        if (in_ctx.$instance_refs[cur_exp]){
          return in_ctx.$instance_refs[cur_exp];
        } else {
          this.logErr(in_el, "  ERR : unable to find EL reference.\n Expr: " + exp, in_ctx);
          // return "";
          throw new Error();
        }
      }
  
      if (isNumRE.test(exp)) { // is number ex : 434
        return exp;
      }
      
      // constant string value
      if (isStringRE.test(exp)) { // is a string ex : "'Toto'"
        // ensure first that there are not several 'totot' + ' ggoi'
        if ((exp.split('"').length + exp.split("'").length) == 4) {
          return exp.match(isStringRE)[1];
        }
      }
      // Process subStatements
      exp = this.extractInBrackets(exp, in_ctx, in_el);    
    //   exp = this.extractInFunction(exp, in_ctx, in_el);
  
  
      // May conflict with complex types...
      // Not tested... not sure that works...
      if (isObjectRE.test(exp)) {
        //console.log("!!!!return object!!! " + exp);
        try {
          let f = new Function( "return " + exp ); // check syntax
          res = f.call( in_ctx.$app );
          return res;
        } catch (e){
          this.logErr(in_el, "  ERR : unable to interpret  as an object.\n Expr: " + exp, in_ctx);
          throw new Error();
          return "";
        }
      }
  
  
  
      // if simple expression related to a var
      /* exemple :  
        my_var
        myvar.prop1
        myvar[b]      (b= 'prop1')
        myvar['prop1']
        myvar.prop1.toUpperCase()
      */
     // Test it without considering what are within a function statement
      if (isVarRE3.test(this.maskInFunctionStatements(exp))) {
        let val;
        let ref_obj;
  
        // Extract any statement within [ ] and replace with ".processedVaue"
        var bracketRE = /(\[(?:\[??[^[(]*?\]))/mg;
        exp = exp.replace( bracketRE, k => {
          this.log("Going for replacement for " + k);
          // remove  '['  ']' 
          let x = k.replace(/[\[\]]+/g, () => {return "";})
          return "." + this.processExpr(x, in_ctx, in_el, {}); // do not pass localContext, no binding to do on those sub processExpr
        });
        
        // return value from explicited context data
        if (exp.match(/^\$\./)) {
          return this.getValueFromDataContext( exp.slice(2), in_ctx );
        }

        // when function (example )
        let fn_statements = []
        let i, o, var_membs = this.maskInFunctionStatements(exp, fn_statements).split(".");
        for (i in var_membs) {
          o = var_membs[i];
          if (i == 0) {
            let first_member = o.replace(/\(.*\)/, "");
            if (first_member == "#"){ // Refer to APP Context
              ref_obj = val = in_ctx.$app;
              continue;
            }
            if (first_member == "CST"  && window.CST) {  // Grab a CONSTANT Value
              ref_obj = val = window.CST; 
              in_lctx.bindScope = C_NOBIND; // Not bindable
              continue;
            }
  
            // Perform some test to check if results can be found from $data (which has most priority).
            let in$data = in_ctx.$data.find( cd => ( Object.keys(cd).indexOf(first_member) >= 0) );
  
            if (in_ctx.$render[first_member] !== undefined) { val = in_ctx.$render; }  // local rendering context (loop indexes, ...)
            //else if (in_ctx.$data[o] !== undefined) { val = in_ctx.$data; } 
            else if ( in$data !== undefined) { val = in$data; }
            else if (in_ctx.$app[first_member] !== undefined) { val = in_ctx.$app; }
            else {
              this.logErr(in_el, "  ERR : variable " + o + " not available in any context.\n Expr: " + exp, in_ctx);
              throw new Error();
              return "";
            }
          }
  
          // Special handling for functions;
          let func_tmp = o.match(isFuncRE);
          if (func_tmp) {
            let fct_name = func_tmp[1];      
            if (typeof val[fct_name] ==="function") {
              // need to process params within that function
              let f_params = [];
              let fn_statement = fn_statements.pop();
              fn_statement.split(",").forEach((p) => {
                if (p != "") {
                  f_params.push(this.processExpr(p, in_ctx, in_el, {bindScpe : C_NOBIND}));
                }
              });
              f_params.push(in_el);
              // call within contexte
              ref_obj = val;
              val = val[fct_name].apply(val, f_params);
            } else { 
              this.logErr(in_el, "  ERR : property " + o + " does not point to a valid function.\n Expr: " + exp, in_ctx);
              throw new Error();
              return "";
            }
          } else {
            if (val[o] === undefined) {
              this.logErr(in_el, "  ERR : property " + o + " not found.\n Expr: " + exp, in_ctx);
              // Huge limitation here, since we can't distinguish null, from 0, from ""...
              throw new Error();
              return "";
            }
            
            ref_obj = val;
            val = val[o];
          }
        }
        /* At this point, we may want to register binding... */
        if (in_lctx.bindScope && in_lctx.bindScope != C_REFRESH && in_lctx.bindScope != C_NOBIND ){
          this.JBind({
            ctx : in_ctx,
            fqdn : exp,
            el : in_el,
            obj : ref_obj,
            prop: o,
            bind_scope : in_lctx.bindScope
          });
        }
        return val;
      }
  
      //if complex expression  (example : ==> var1 + ' is related to ' + var2.prop  <==)
      // Static strings must be encapsulated with  simple quote ' 
      // does not support functions (not supported  : var1 + fct(var2) )
      if (isComplexExpRE.test(exp)) {
        this.dbg("Trying to analyse complex exp " + exp);
        //get and evaluate each "word"
        var processed_exp = exp;
        let nb_sub = 0;
        let string_statements = [];
        processed_exp = processed_exp.replace(/\'(.*?)\'/g, function (x, y) {
          string_statements.push(y);
          return '§§§';
        });
  
        // ok, now we have simplified the complexe expression. should only remain variables
        // let wordsRE = /(\${0,1}[a-zA-Z0-9_.\[\]\(\)]+)/g;
        let wordsRE = isVarRE3_g;
        let cpx_exp = processed_exp.replace(wordsRE, function (x, e) {
          // Trying to evaluate statements  within.
          let res = _this.processExpr( e, in_ctx, in_el);
          if (typeof res == "string") res = '"' + res + '"';
          if (typeof res == "object") {
            this.warn(`A complex RE '${e}' in '${exp}' is making use of an object.\n Can be dangerous is an assignment is done... (ex a.b = 'toto', instead of a.b == 'toto').`);
          };
          return res;
        });
  
        // now restore string statements.
        let i = 0;
        cpx_exp = cpx_exp.replace(/§§§/g, function (x, y) {
          return "'" + string_statements[i++] + "'";
        })
  
        if (cpx_exp.split("=").length == 2) {
          this.warn(`An affectation in a complex exp  has been found : '${exp}' results in '${cpx_exp}'. Use comparison '==' instead of affectation '=' `);
          return false;
        }
        let f = new Function("return " + cpx_exp);
        this.dbg("Complex exp is : " + cpx_exp);
        return f.call(in_ctx.$app);
      }
    } //end processExpr
  
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
              // Bind on directive
              if ( map.bind_scope[0] == ':' ) {
                JNgine.fn( map.bind_scope.slice(1), map.el.origDef[map.bind_scope], map.el, opt.ctx, { } );
              } else if (map.bind_scope[0] == '$') {
                map.el.setAttribute( map.bind_scope.slice(1), JNgine.processExpr(map.el.origDef[map.bind_scope], opt.ctx, map.el,  { } ) );
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
      if (['INPUT','SELECT'].indexOf(opt.el.tagName) >=0 ) {
        opt.el.addEventListener('keyup', function (event) {
          if (opt.obj[opt.prop] != opt.el.value){
            //console.log(" Input Changed to  :" + opt.el.value);
            opt.obj[opt.prop] = opt.el.value;
          }
        });
        opt.el.addEventListener('change', function (e) {
          if (opt.obj[opt.prop] != opt.el.value){
            //console.log(" Input Changed to  :" + opt.el.value);
            opt.obj[opt.prop] = opt.el.value;
          }
        });     
      }
      return;
    }
  
  
  
    // ----------------------------------------------
    // Directives registries
    this.fn_map = {};
    this.fn = function( in_dir_name, in_exp, in_el, in_ctx, in_local) {
      if (typeof this.fn_map[in_dir_name] == "function") {
        try {
          if (in_el.origDef === undefined) { in_el.origDef = {} } 
          in_el.origDef[":"+in_dir_name]= in_exp; // save orig def
          // determine if bind requested :
  
          // call it
          //return this.fn_map[in_dir_name](in_el, in_exp, in_ctx, in_local);
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
  JNgine.fn_map.if = function (in_el, exp, ctx) {
    if (!this.processExpr(exp, ctx, in_el, { bindScope : C_NOBIND } )) {
      in_el.remove();
      return false;
    }
    return true;
  }
  
  //----------------------------------------------------
  JNgine.fn_map["if-defined"] = function (in_el, exp, ctx) {
    if (this.processExpr(exp, ctx, in_el, { bindScope : C_NOBIND }) === '') {
      in_el.remove();
      return false;
    }
    return true;
  }
  
  //----------------------------------------------------
  JNgine.fn_map["if-not"] = function (in_el, exp, ctx) {
    if (this.processExpr(exp, ctx, in_el, { bindScope : C_NOBIND })) {
      in_el.remove();
      return false;
    }
    return true;
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
    in_ctx.$refs[expr].push( in_el );
    in_ctx.$instance_refs[expr].push( in_el );
    return true;
  }
  //----------------------------------------------------
  //rws-mapdomtovar  (but to a var  in $app.$refs)
  JNgine.fn_map["ref-app"] = function (in_el, in_exp, in_ctx) {
    console.warn("directive 'ref-app' deprecated");
    if (in_ctx.$app.$refs === undefined) {
      in_ctx.$app.$refs = {}
    }
    in_ctx.$app.$refs[in_exp] = in_el
    return true;
  }
  
  //----------------------------------------------------
  JNgine.fn_map["show-if"] = function (in_el, in_exp, in_ctx, in_lctx) {
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
  JNgine.fn_map.repeat = function (in_el, exp, ctx, in_lctx) {
    // :repeat="expr" , expr will be evaluated, and represents the number of times. Must be a number.
    in_el.removeAttribute(":repeat");
    let count = this.processExpr(exp, ctx, in_el, { bindScope : C_NOBIND });
    if (isNaN(count)) {
      this.logErr(in_el, " ERR(repeat) : Expects a numeric, got " + count + "\n Expr: " + exp, ctx)
      return
    }
    let i;
    for (i = 0; i < count; i++) {
      let new_el = in_el.cloneNode(true);
      in_el.parentNode.insertBefore(new_el, in_el);
      this.handleNode(new_el, ctx);
    }
    in_el.remove();
    return false;
  }
  
  //----------------------------------------------------
  // Usage :
  // :for="section in sections"
  // :for="section in getSections()"
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
      exp = z[1];
    }
  
    const forExpRE = /^(\w+)\s+in\s+(.+)$/;
    let t = exp.trim().match(forExpRE);
    if (!t) {
      this.logErr(in_el, " ERR(for) : No matching quote found.\n Expr: " + exp, ctx)
      return false;
    }
  
  
    // get list of val
    // exemple ==> "e in elements"
    let sourceList = JNgine.processExpr(t[2], ctx, in_el, in_lctx);
    let iteration_datas = [];
    let sourceIsObject = false;
    if (Array.isArray(sourceList)){
        iteration_datas = sourceList;
    } else  {
      // Try to see if it is an Object... ==> Iterate over Keys
      if (typeof sourceList === 'object' && sourceList !== null){
        //_this.dbg("iteration source is an object... map value as arrays");
        Object.keys(sourceList).forEach((key) => { iteration_datas.push(sourceList[key]);});
        sourceIsObject = true;
      } else {
        this.logErr(in_el, " WAR(for) : source is neither an array nor an object " + sourceList + ". Setting to empty.\n Expr: " + exp, ctx)
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
    //in_el.style.display="none";
  
    // return false because nothing more to be done on that element.
    return false;
  }
  
  //----------------------------------------------------
  // handler directive allows management of an element outside of the Ngine.
  // child of that elements won't be processed !!!!
  JNgine.fn_map.handler = function (in_el, in_exp, in_ctx,in_lctx) {
  
      // Should the handler function be called with explicit params? 
      let withRE = /^(\w+)\s+with\s+(.+)\s*$/;
      let hdl_func;
      let params = [in_el];
      let m = in_exp.match(withRE);
      if ( m ) {
        hdl_func = JNgine.processExpr( m[1], in_ctx, in_el, { bindScope : C_NOBIND });;
        m[2].split(",").forEach( m_exp => {
          params.push(this.processExpr(m_exp, in_ctx, in_el, { bindScope : C_NOBIND }));
        });
        
      } else {
        hdl_func = this.processExpr(in_exp, in_ctx, in_el, { bindScope : C_NOBIND });
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
  // Sets a default value to be used infor forms element
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
    in_lctx.posthandler = this.processExpr(in_exp, in_ctx, in_el, in_lctx);
    return true; // continue
  }
  
  //----------------------------------------------------
  // Format  : <form :formdata="DATAS"  (DATAS = Object)
  JNgine.fn_map.formdata = function (in_el, in_exp, in_ctx, in_lctx) {
    in_lctx["formdata"] = this.processExpr(in_exp, in_ctx, in_el, in_lctx);
    in_ctx.$formdata = in_lctx["formdata"];
    return true; // continue
  }
  
  //----------------------------------------------------
  // Format  : <div :includetpl="mytpl_root_elem_id"
  // Format  : <div :includetpl="{{vartoelemid}}"    , with vartoelem_id = string for document.getElementById
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
  JNgine.fn_map["set-css"] = function (in_el, in_exp, in_ctx, in_lctx) {
    let setRE = /^([a-z-A-Z]*)\s*=\s*(.*)$/  // correction 2019-04 to handle "background-color=red" (hadnling of "-")
    in_exp.split(",").forEach( sub_exp => {
      let t = sub_exp.trim().match(setRE);
      if (t) {
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
    var Ngine = this;
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
      // Do not use () =>  ! Use function() to preserve local this context
      navTo: function (in_tab_name, e) { 
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
        _this.logErr(in_el, " ERR : tab_name : Could not identify cb fn .\n Expr: " + in_exp, in_ctx);
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
    }
  
    return true;
  }
  
  //----------------------------------------------------
  JNgine.fn_map.tab_nav_to = function (in_el, in_exp, in_ctx, in_lctx) {
    let $tab = in_ctx.$tabs[in_ctx.$cur_tab.name];
    in_el.addEventListener('click', function (e) {
      $tab.navTo(in_exp, e);
    });
    return true;
  }
  
  //----------------------------------------------------
  // set a context variable at rendering time 
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
  // associate a context attribute to current element
  // that can be refered to when rendering.
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
  JNgine.fn_map.toggle = function (in_el, in_exp, in_ctx, in_lctx) {
    let $refs = in_ctx.$refs;
    in_el.style.cursor = "pointer";
  
    let expr = in_exp;
    let matchs = in_exp.match("{{(.*)}}");
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
  JNgine.fn_map.toggleref = function (in_el, in_exp, in_ctx) {
    let $refs = in_ctx.$refs;
    in_el.style.cursor = "pointer";
    in_el.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      let refs = in_exp.split(",");
      refs.forEach( ref => {
        if  ( $refs[ref] ) { 
          $refs[ref].toggle();
        }
      });
    });
    return true; // continue
  }


/* Possible extention with jQuery

  
//----------------------------------------------------
JNgine.fn_map["slidetoggle"] = function (in_el, in_exp, in_ctx, in_lctx) {
    let $refs = in_ctx.$refs;
    in_el.style.cursor = "pointer";
  
    let expr = in_exp;
    let matchs = in_exp.match("{{(.*)}}");
    if (matchs) {
      expr = JNgine.processExpr(matchs[1], in_ctx, in_el, C_NOBIND);
      this.dbg("map.ref slideto from " + in_exp +"  gives " + expr);
    }
  
  
    if (expr == "this") {
      in_el.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        $j(in_el).slideToggle();
      });
      return true;
    }
    in_el.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      let refs = expr.split(",");
      refs.forEach( ref => {
        if  ( $refs[ref] ) { 
          $j($refs[ref]).slideToggle();
        }
      });
    });
    return true;
  }

*/
