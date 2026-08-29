var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __knownSymbol = (name, symbol) => (symbol = Symbol[name]) ? symbol : Symbol.for("Symbol." + name);
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};
var __await = function(promise, isYieldStar) {
  this[0] = promise;
  this[1] = isYieldStar;
};
var __asyncGenerator = (__this, __arguments, generator) => {
  var resume = (k, v, yes, no) => {
    try {
      var x = generator[k](v), isAwait = (v = x.value) instanceof __await, done = x.done;
      Promise.resolve(isAwait ? v[0] : v).then((y) => isAwait ? resume(k === "return" ? k : "next", v[1] ? { done: y.done, value: y.value } : y, yes, no) : yes({ value: y, done })).catch((e) => resume("throw", e, yes, no));
    } catch (e) {
      no(e);
    }
  }, method = (k) => it[k] = (x) => new Promise((yes, no) => resume(k, x, yes, no)), it = {};
  return generator = generator.apply(__this, __arguments), it[__knownSymbol("asyncIterator")] = () => it, method("next"), method("throw"), method("return"), it;
};
var __forAwait = (obj, it, method) => (it = obj[__knownSymbol("asyncIterator")]) ? it.call(obj) : (obj = obj[__knownSymbol("iterator")](), it = {}, method = (key, fn) => (fn = obj[key]) && (it[key] = (arg) => new Promise((yes, no, done) => (arg = fn.call(obj, arg), done = arg.done, Promise.resolve(arg.value).then((value) => yes({ value, done }), no)))), method("next"), method("return"), it);

// src/glue/messages.ts
var GLUE_VERSION = 1;
var GLUE_MESSAGE_PROTOTYPES = {
  "erro_evt": {
    "name": "erro_evt",
    "structName": "glue_msg_error",
    "className": "GlueMsgError",
    "fields": [
      {
        "type": "str",
        "name": "message",
        "isNullable": false
      }
    ]
  },
  "load_req": {
    "name": "load_req",
    "structName": "glue_msg_load_req",
    "className": "GlueMsgLoadReq",
    "fields": [
      {
        "type": "arr_str",
        "name": "model_paths",
        "isNullable": false
      },
      {
        "type": "str",
        "name": "mmproj_path",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "n_ctx_auto",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "use_mmap",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "use_mlock",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_gpu_layers",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_ctx",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_threads",
        "isNullable": false
      },
      {
        "type": "str",
        "name": "model_alias",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "log_level",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "embeddings",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "offload_kqv",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "n_batch",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "n_ubatch",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "n_parallel",
        "isNullable": true
      },
      {
        "type": "str",
        "name": "pooling_type",
        "isNullable": true
      },
      {
        "type": "str",
        "name": "rope_scaling_type",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "rope_freq_base",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "rope_freq_scale",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "yarn_ext_factor",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "yarn_attn_factor",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "yarn_beta_fast",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "yarn_beta_slow",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "yarn_orig_ctx",
        "isNullable": true
      },
      {
        "type": "str",
        "name": "cache_type_k",
        "isNullable": true
      },
      {
        "type": "str",
        "name": "cache_type_v",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "kv_unified",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "flash_attn",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "swa_full",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "n_ctx_checkpoints",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "checkpoint_min_step",
        "isNullable": true
      },
      {
        "type": "str",
        "name": "chat_template",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "jinja",
        "isNullable": true
      },
      {
        "type": "arr_str",
        "name": "default_template_kwargs_keys",
        "isNullable": true
      },
      {
        "type": "arr_str",
        "name": "default_template_kwargs_vals",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "reasoning",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "image_min_tokens",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "image_max_tokens",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "warmup",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "no_kv_offload",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "mmproj_offload",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "cont_batching",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "n_keep",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "ctx_shift",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "cache_idle_slots",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "n_cache_reuse",
        "isNullable": true
      },
      {
        "type": "arr_str",
        "name": "lora_paths",
        "isNullable": true
      },
      {
        "type": "arr_float",
        "name": "lora_scales",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "lora_init_without_apply",
        "isNullable": true
      },
      {
        "type": "str",
        "name": "spec_draft_model",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "spec_draft_ngl",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "spec_draft_n_max",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "spec_draft_n_min",
        "isNullable": true
      },
      {
        "type": "float",
        "name": "spec_draft_p_min",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "spec_draft_threads",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "spec_draft_threads_batch",
        "isNullable": true
      },
      {
        "type": "arr_str",
        "name": "kv_overrides_keys",
        "isNullable": true
      },
      {
        "type": "arr_str",
        "name": "kv_overrides_vals",
        "isNullable": true
      },
      {
        "type": "int",
        "name": "reasoning_budget_tokens",
        "isNullable": true
      },
      {
        "type": "str",
        "name": "reasoning_budget_message",
        "isNullable": true
      },
      {
        "type": "str",
        "name": "reasoning_format",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "skip_chat_parsing",
        "isNullable": true
      },
      {
        "type": "bool",
        "name": "prefill_assistant",
        "isNullable": true
      }
    ]
  },
  "load_res": {
    "name": "load_res",
    "structName": "glue_msg_load_res",
    "className": "GlueMsgLoadRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_ctx",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_batch",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_ubatch",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_vocab",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_ctx_train",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_embd",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "n_layer",
        "isNullable": false
      },
      {
        "type": "arr_str",
        "name": "metadata_key",
        "isNullable": false
      },
      {
        "type": "arr_str",
        "name": "metadata_val",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "token_bos",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "token_eos",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "token_eot",
        "isNullable": false
      },
      {
        "type": "arr_int",
        "name": "list_tokens_eog",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "add_bos_token",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "add_eos_token",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "has_encoder",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "token_decoder_start",
        "isNullable": false
      },
      {
        "type": "str",
        "name": "media_marker",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "has_image_input",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "has_audio_input",
        "isNullable": false
      }
    ]
  },
  "cmpl_req": {
    "name": "cmpl_req",
    "structName": "glue_msg_completion_req",
    "className": "GlueMsgCompletionReq",
    "fields": [
      {
        "type": "bool",
        "name": "is_chat",
        "isNullable": false
      },
      {
        "type": "str",
        "name": "data_json",
        "isNullable": false
      },
      {
        "type": "arr_raw",
        "name": "files",
        "isNullable": false
      }
    ]
  },
  "cmpl_res": {
    "name": "cmpl_res",
    "structName": "glue_msg_completion_res",
    "className": "GlueMsgCompletionRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "req_id",
        "isNullable": false
      }
    ]
  },
  "embd_req": {
    "name": "embd_req",
    "structName": "glue_msg_embedding_req",
    "className": "GlueMsgEmbeddingReq",
    "fields": [
      {
        "type": "str",
        "name": "data_json",
        "isNullable": false
      },
      {
        "type": "arr_raw",
        "name": "files",
        "isNullable": false
      }
    ]
  },
  "embd_res": {
    "name": "embd_res",
    "structName": "glue_msg_embedding_res",
    "className": "GlueMsgEmbeddingRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "req_id",
        "isNullable": false
      }
    ]
  },
  "rrnk_req": {
    "name": "rrnk_req",
    "structName": "glue_msg_rerank_req",
    "className": "GlueMsgRerankReq",
    "fields": [
      {
        "type": "str",
        "name": "data_json",
        "isNullable": false
      }
    ]
  },
  "rrnk_res": {
    "name": "rrnk_res",
    "structName": "glue_msg_rerank_res",
    "className": "GlueMsgRerankRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "int",
        "name": "req_id",
        "isNullable": false
      }
    ]
  },
  "gres_req": {
    "name": "gres_req",
    "structName": "glue_msg_get_result_req",
    "className": "GlueMsgGetResultReq",
    "fields": [
      {
        "type": "int",
        "name": "req_id",
        "isNullable": false
      }
    ]
  },
  "gres_res": {
    "name": "gres_res",
    "structName": "glue_msg_get_result_res",
    "className": "GlueMsgGetResultRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "has_more",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "is_error",
        "isNullable": false
      },
      {
        "type": "str",
        "name": "data_json",
        "isNullable": false
      }
    ]
  },
  "cncl_req": {
    "name": "cncl_req",
    "structName": "glue_msg_cancel_req",
    "className": "GlueMsgCancelReq",
    "fields": [
      {
        "type": "int",
        "name": "req_id",
        "isNullable": false
      }
    ]
  },
  "cncl_res": {
    "name": "cncl_res",
    "structName": "glue_msg_cancel_res",
    "className": "GlueMsgCancelRes",
    "fields": [
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      }
    ]
  },
  "tbop_req": {
    "name": "tbop_req",
    "structName": "glue_msg_test_backend_ops_req",
    "className": "GlueMsgTestBackendOpsReq",
    "fields": [
      {
        "type": "arr_str",
        "name": "args",
        "isNullable": false
      }
    ]
  },
  "tbop_res": {
    "name": "tbop_res",
    "structName": "glue_msg_test_backend_ops_res",
    "className": "GlueMsgTestBackendOpsRes",
    "fields": [
      {
        "type": "int",
        "name": "retcode",
        "isNullable": false
      },
      {
        "type": "bool",
        "name": "success",
        "isNullable": false
      }
    ]
  }
};

// src/glue/glue.ts
var GLUE_MAGIC = new Uint8Array([71, 76, 85, 69]);
var GLUE_DTYPE_NULL = 0;
var GLUE_DTYPE_BOOL = 1;
var GLUE_DTYPE_INT = 2;
var GLUE_DTYPE_FLOAT = 3;
var GLUE_DTYPE_STRING = 4;
var GLUE_DTYPE_RAW = 5;
var GLUE_DTYPE_ARRAY_BOOL = 6;
var GLUE_DTYPE_ARRAY_INT = 7;
var GLUE_DTYPE_ARRAY_FLOAT = 8;
var GLUE_DTYPE_ARRAY_STRING = 9;
var GLUE_DTYPE_ARRAY_RAW = 10;
var TYPE_MAP = {
  str: GLUE_DTYPE_STRING,
  int: GLUE_DTYPE_INT,
  float: GLUE_DTYPE_FLOAT,
  bool: GLUE_DTYPE_BOOL,
  raw: GLUE_DTYPE_RAW,
  arr_str: GLUE_DTYPE_ARRAY_STRING,
  arr_int: GLUE_DTYPE_ARRAY_INT,
  arr_float: GLUE_DTYPE_ARRAY_FLOAT,
  arr_bool: GLUE_DTYPE_ARRAY_BOOL,
  arr_raw: GLUE_DTYPE_ARRAY_RAW,
  null: GLUE_DTYPE_NULL
};
function glueDeserialize(buf) {
  let offset = 0;
  const view = new DataView(buf.buffer);
  const readUint32 = () => {
    const value = view.getUint32(offset, true);
    offset += 4;
    return value;
  };
  const readInt32 = () => {
    const value = view.getInt32(offset, true);
    offset += 4;
    return value;
  };
  const readFloat = () => {
    const value = view.getFloat32(offset, true);
    offset += 4;
    return value;
  };
  const readBool = () => {
    return readUint32() !== 0;
  };
  const readString = (customLen) => {
    const length = customLen != null ? customLen : readUint32();
    const value = new TextDecoder().decode(buf.slice(offset, offset + length));
    offset += length;
    return value;
  };
  const readRaw = () => {
    const length = readUint32();
    const value = buf.slice(offset, offset + length);
    offset += length;
    return value;
  };
  const readArray = (readItem) => {
    const length = readUint32();
    const value = new Array(length);
    for (let i = 0; i < length; i++) {
      value[i] = readItem();
    }
    return value;
  };
  const readNull = () => null;
  const readField = (field) => {
    switch (field.type) {
      case "str":
        return readString();
      case "int":
        return readInt32();
      case "float":
        return readFloat();
      case "bool":
        return readBool();
      case "raw":
        return readRaw();
      case "arr_str":
        return readArray(readString);
      case "arr_int":
        return readArray(readInt32);
      case "arr_float":
        return readArray(readFloat);
      case "arr_bool":
        return readArray(readBool);
      case "arr_raw":
        return readArray(readRaw);
      case "null":
        return readNull();
    }
  };
  const magicValid = buf[0] === GLUE_MAGIC[0] && buf[1] === GLUE_MAGIC[1] && buf[2] === GLUE_MAGIC[2] && buf[3] === GLUE_MAGIC[3];
  offset += 4;
  if (!magicValid) {
    throw new Error("Invalid magic number");
  }
  const version = readUint32();
  if (version !== GLUE_VERSION) {
    throw new Error("Invalid version number");
  }
  const name = readString(8);
  const msgProto = GLUE_MESSAGE_PROTOTYPES[name];
  if (!msgProto) {
    throw new Error(`Unknown message name: ${name}`);
  }
  const output = { _name: name };
  for (const field of msgProto.fields) {
    const readType = readUint32();
    if (readType === GLUE_DTYPE_NULL) {
      if (!field.isNullable) {
        throw new Error(
          `${name}: Expect field ${field.name} to be non-nullable`
        );
      }
      output[field.name] = null;
      continue;
    }
    if (readType !== TYPE_MAP[field.type]) {
      throw new Error(
        `${name}: Expect field ${field.name} to have type ${field.type}`
      );
    }
    output[field.name] = readField(field);
  }
  return output;
}
function glueSerialize(msg) {
  const msgProto = GLUE_MESSAGE_PROTOTYPES[msg._name];
  if (!msgProto) {
    throw new Error(`Unknown message name: ${msg._name}`);
  }
  const bufs = [];
  const writeUint32 = (value) => {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setUint32(0, value, true);
    bufs.push(new Uint8Array(buf));
  };
  const writeInt32 = (value) => {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setInt32(0, value, true);
    bufs.push(new Uint8Array(buf));
  };
  const writeFloat = (value) => {
    const buf = new ArrayBuffer(4);
    new DataView(buf).setFloat32(0, value, true);
    bufs.push(new Uint8Array(buf));
  };
  const writeBool = (value) => {
    writeUint32(value ? 1 : 0);
  };
  const writeString = (value) => {
    const utf8 = new TextEncoder().encode(value);
    writeUint32(utf8.byteLength);
    bufs.push(utf8);
  };
  const writeRaw = (value) => {
    writeUint32(value.byteLength);
    bufs.push(value);
  };
  const writeArray = (value, writeItem) => {
    writeUint32(value.length);
    for (const item of value) {
      writeItem(item);
    }
  };
  const writeNull = () => {
  };
  bufs.push(GLUE_MAGIC);
  writeUint32(GLUE_VERSION);
  {
    const utf8 = new TextEncoder().encode(msg._name);
    bufs.push(utf8);
  }
  for (const field of msgProto.fields) {
    const val = msg[field.name];
    if (!field.isNullable && (val === null || val === void 0)) {
      throw new Error(
        `${msg._name}: Expect field ${field.name} to be non-nullable`
      );
    }
    if (val === null || val === void 0) {
      writeUint32(GLUE_DTYPE_NULL);
      continue;
    }
    writeUint32(TYPE_MAP[field.type]);
    switch (field.type) {
      case "str":
        writeString(val);
        break;
      case "int":
        writeInt32(val);
        break;
      case "float":
        writeFloat(val);
        break;
      case "bool":
        writeBool(val);
        break;
      case "raw":
        writeRaw(val);
        break;
      case "arr_str":
        writeArray(val, writeString);
        break;
      case "arr_int":
        writeArray(val, writeInt32);
        break;
      case "arr_float":
        writeArray(val, writeFloat);
        break;
      case "arr_bool":
        writeArray(val, writeBool);
        break;
      case "arr_raw":
        writeArray(val, writeRaw);
        break;
      case "null":
        writeNull();
        break;
    }
  }
  const totalLength = bufs.reduce((acc, buf) => acc + buf.byteLength, 0);
  const output = new Uint8Array(totalLength);
  let offset = 0;
  for (const buf of bufs) {
    output.set(buf, offset);
    offset += buf.byteLength;
  }
  return output;
}

// src/wasm/source-map.ts
var WASM_SOURCE_MAP = {
  "default": "H4sIAAAAAAAAA+S963PcNrYvOlWThz1O/LYlS37ItiyTfsVqyZ6MxvHsTJLJzs5kJpN51d77nINCk+huRnyZIFtS6pTq3s/32/14/9hbt9YCQAIgQLa9c6pu1fliq7F+BEkQj4WFtX7ri1/84hf/161f/GLjwi9+scYyHlVJWbOcTJskrZOczCrGPipKVtG6qLZydvSr+TxLCZ0WVX0tTTMyr2i5IFGR1+y4PjiIpnfSlGaUZEXMUjKlnB0cRBWjNSM1y3lRneF1fHDw7NmzzajIsiInP/IiPzg41X4F4TlComNK6kVVHK2Lv2maFhFUw44jVtZJkV8VAnjErvBj8XxxTJKsTK8ezcvm90kef10VTfkDSxnl7GNeV0k+J7Oiymh9J0qTUj5uWtCYVQcH8L98XH7L8ZbQOjHJiyq7KR+7ZHNS0orD1aq5Hl8WTZEWc5LkNatymn6QsSzKyvPyMhDROBYPPWc1qYoj/nWeFouM5vnBAbQGodOELPfI7oQ8PziYUp5E2EqvOtizZ89eHxxQzllVkyRf0iqheX2v92z4WcUbJjWraPrJtCjSLf2LqSaAhzlkJ6+anCfznMVbCdxkW/tKZEnTBr6uXXQB36ZifEFLRvbiS/gRmtmMVfILbHnbNC0qSrLsBlYhimZFdUSrmLDjkubxeVF5UTL8wB/wukpZfkF0BZbHJKJ1tDiLKKj7I/wra1KS0fqmeNNFSSua8YODnLBsGpMFozE5fI8dl7Pz2Bvw0aAzD12w/LitGp7kiniEeQPPWon3NMpo9KZJKnZ74KvUdL6GlSYcHz6ZN0XDsVM8HP1Ss7Sg9ev7iMMxpvrhZ5+9iha0eoKl8BVFm5SsypqaibfgrCY5zaxvN4nN3/vxeULik5xmSUQiyutL4gWnbJ7kouWvGaMaXoImOd/TXrrJ6yRtB8upRxKE61ZN7Y8rYohXjHCaMYKPdq33oeAbDY0AXtKIBaFoi2XCjshevO6shRwur/YEVQG9ydOLZ7P8oUN42isLwgvGW9L6nOq5Ea2v9O46m4n5l0c0ZTve+yd5SYqmJknMg/CS0Qlh4l7XutHBgfZDa4xJLJ4kn57UjF/CYdGbyBbVU71Hvjli+V5dc3zTfnEQbjueuFd048ck/5EeHMyaPCK0mnPRxcuCb7pH45LM31CP7BBk1402bofF/rJIYjFUCKlhFZnSlOYRI3RWs4okOcynrzoAjJ17g41eFjwIP3/H+bsT3R28CbzYQ8dEfNorC8KL+BHFSocD3L+cRUsWXUK4/p3vDgyhipWM1mvk7/lRksfkC5qm37OKFzlNk/rksug/7EiupGQ3/qAqmjyeXbUlOJOLh/y3d2w8vSFixuuqkA9gTKU3HCpOhprFmrOP/Od/fwaL18HBn6c/sqj+PeXslSj4oshKcefTThaE/jnhzeHy9jxtGKlPSiYVI/P3e2kxnwX40EdsOi8bktFDpTaRKTTxHNQYwvK6Ohn6MLQusiT6MCmrJK9n/k9O6zq/rq94nWKznlESV2SW0ojAcgYaUUSjBbsz1CGalN0f0f+gIcQiXlc052XB2XtRwWcfpqJz+Gc1eFocAIfLILzdnyVYzpuKkaho8vqqFGOPIFGRlbRivR45iTcc2h/MNs3e5Pfd9LBkUV1UYibAPii+PCGUg3ZEjpJ6QXjyE7Mg2ny6H9+XH7VMSpYmOQxYqyQIH4rO1WqsX8GXPjg4NQuC8N9duEfGw3YI9bAsK1MaQV+LDglPiyNS0nphAc+DqvD69VZU5LzeCc/MZCf6YM5qli834evUxSHLk59YRcqUZsVEfqDLxhBieRyEH/N6mhDQbHdfpuw9nuSzT/VZd0H5gtR0mrJXXYl63rggFQPEq7pq2Gu/0pgVDJZc8/60qujJhk+HCML3aF0kQvmpMo59/q5LvTI6r9ArYcehOpjYS+D/QfjdwGchpMmTPKkTmiY/sVjtZ4qKREV5glOgaAMUdL0H3pVMYt88BHq1Yx4S105pVSWseqANWVqxnJpqFxYF4QN9+UhqllkrChQZ+tJuvDUwF6Ayp3//KbtnfA3cgdSFtmF6FIT3JSRa0JpkfN49gyoJwv9XuysreZLC33j3J/oD8ZpWtUsAuwRHsdwSOatibxoGioFDFi2KxC2B5bFOYFPqklL3U+SF85lpfqKKxRfgyTwrkvhaf/aezfKr/ZEQhBvGlAjqqPwrCIe+Iyt5EG52Y69ivEnrgwPcYudlU1+XXS06hIadNjOhaKzbxTNW4ciBLVuUlWd4LmYWuVejvA71T60UudN+YRCew9dmeVTEbM24kZzZOau3jffFRoC3htldLv08CM2WYllZnwThw65RSVTMlykOBbssCP9lhRUChrx3fbjq2Ozt3h/4GKojGot29/d2t/mr2Jwdw543WoibwrxO4KYfz+fNjMxAnThkJ5f/+MfvyLf/6AZhEJ4hhC/mrI7er2m+mO2M7jwB8PoMga1wnezdKytGjuY8PTj4vmJlVUSMcxjmZfvrRjt50pplLK8PDtgxi5qa7enqD1/AfUiaTA8O9HI5JatlUwyIOskYafgVs+vj+mxvDhNO+BG9ZfSPAidP6CBC7Q+ltKIJZ3FnX+qXPBybBEmRM1LMLhlPFjdZ6d6rH+GXqp9s4UL4Xl0lWU9x2Y+HeklGq0PYQd9o8gRGCInKGjS5OSdyLpBWFNTfyX48pEuK+W2z+6hfHZfVH9kxyHLcwl7vN2/FIrlWwrp6TbfBoKlhkSjLTFTkSzKJTbOB+BhBONSfCTmqKLRQX0+TdXGaefU0E3LTNVdB7wbsdULKelGBIQDsJcekydMiOrxqF0PhBfha5GiR1AztC78b2s3ErKYJbMChMXsbmjmrg1AaZ5op6gdidzYr9yakLsis3H0pB91sb6OnXLY96pax2xdGxpKRGYW24hdxNsCRvMStyIXOwECmCeWmBWg3NjfTZcMX2HA37NUlAZ0KdNqzcr1Kmwtyps9lz3sqHzpOeAkflsSMR51abBQH4dmlWjF+1/viSV4L89aB94snef3oyRb8+/qafFZlg2LHJYvqe267w+ERreakqGBvf0YYzmh81+gwGaup6C5lmtQEZ7VNV5dKOFkUvB5cbkFtvuE2ZvAgvGFUKxsKLx4aw0LjXRP6QU3ncxZruE3OqiWrSE354cHBqfYrCPfFkxwuxeaPxHy5r1n7i6yEPYC034u/cRMMF7UwfpJHi6qALUMQ1qsMCdwTs6qCM4e3git93RpOG1mdxZrNqSgOm1LsYx6aG10aE5jVxO9ZBQZGsAGy6jwOFLwTqDePV9mmkoQf0W6vqo+NJMsa3PioAVKxtLlmfN2YLfFWF2dFxWi0INAzYcUZ+tQ8WrCMDq0OYkIPwlsDRxf/87MbfcUS3qmiR89x9Hm330sq9zF8QYXJ7L2yOJrd9ikQRyyZL+pL1pBMuNosiBfCdYJVNcjwdAdMDTs9A17FsmLJLJOd2tbBKI3ZErR1a7CqaTZDU/utmLGSM3ZIlvuEF1VN6qJIpeLLH6vxA0/aasOnjtIgXJfbn6o4UlNAk3M6Y//y7usCj2CICY2AF7OaZPQYV4eekrAXC2NxlNKsdFm+ItxqDvWmnM1pzc4QMoP2KJarPLZogtUHr4ZvRy9+wLxJU7Sx3RBD9IguxQAto0wMTX5LH7wxQ2WnG7nb0G8WNM8ZaB6l0MV5TfMYTOFScibhhL1paLoud7Y8wX0Gy2su+v+F9oSkaOqykSb6nMRJxh8NDKJXrwIlhbdwbNWWSe0wv8EEcrcFkKJEi7pZEISX5SlmxYRVh6babntvkrJN7wxV8TsenaBib9Bmd9tagODl+REFgxGYhR8YE5p8kNr+LeY12ENcMBTAJBYS+BxiRY3Kk63+LhIeC3soLuBXOpWtTOVWcqLpIjtbpgqp1B9ryzWhTV2oL6X/HRVpCjuAsmK4AsZieeBB+LE4QKkYHkdv/l6Mnh+aFEx42q8gfNpbW1X3pvnJ0YJVDLf97LiuaFSfbQ+K/7jyOOnPB+0+hGSMczpnUt9rpqA7tUcx4mcQbg18eVT61swVX2zbaCXnyHna4GRzVp5Yp41mpdqLr2mzzAy14iN6yL7Xvswjl6b+Iy9GjJQm8CMilfBZkrJfEaL+/IjXVV0ck93J5Ne//mXR1PeGDnxJllK1FZolqTjG1V5nPzY3kxz1F1C5WRaVJ1/qq49YTMQcr5YfXlP5ibR3soTXtS0aJ7OqyEhTzz69ou/c6gLLrkvFjKdFDfshPGEOwl+WNF6p/3i3GaKjy2EbhPcGtvqgB9Oq8uinVRDe7Gkw6u+KzfekHZ5IBwXeLZ8eSRAOHZdXbKb7X0jTJmgHAvnMtjdmHC2XHtvjjm5pqvGj1YzESQXTAi3LVFhpb5qzhvncZ2HnsQAziMc4VNKkejVkHGoBm0lem3PanNWwjXnd7gulw8jH7WAkrJrdctnDcC4FPfyGa18CU159jWVgUv4CV+DWhK2swmheyRjVLHJt0fBXonF8TZ4wogmvhfQ37p1N3buNMyH328/UmgutkiC8I8eNXATxG8KKBhMxKB1Dc8RSzBFileJvqqutow5uEkTjfjA7qpKabTg0rIrhArbe76WcLlkQbvYFYBjCZ9xVMnwuse7hUcOpWxCE7jPMzz67o3dsNKpXLI9Vk+T1X6PJkVCEcXKxpuhWNjZFG8CPxSefVzTLaPUxWmtKMovSgjO0Of7tT+Sb777/ozw58Rpx5hUdM+JIyDNjNwBLNRFGI/zKr4LWjATgILwmu0XFeFnkcEwJXeKFvfrxumI0k2c0+ayADbJVhGuINKLQqiL5WWFhBdc5ZTCANV/s7oRGhtMu9p5rbZeaJRVXpRuiFHtP1fm+5UXMRGdkx6UY9nGyxO5imiQqNsc6weAK+6WKcW4a6vFEd8p4bdrP4SKxSXLOFFHKaHWn32uNr/2F1UFLFjUprZMlI3FFZ3W/C9uIIDQP81CxfOycn+csh36OpyxVkZVigG/1urxVcFH+RrUIWmjNueENwpdj5m+5JsrDO7CvQgdb78yDnNURuJWkODrOELhbPdv76q31h1lV5LUlfQh2GrlaiuGHm1GrLAg/4LBxnO1avR43VOiH5RYEoe4sJPbQS5qCsnDbHirm74/ET7Ep27ItIGJ8dnabezYAHpvDH2DMJg1n8SVjkMGlchXkGVoHrnaegbhXm804q6/oRma5ljsPjOasvm+Ug92h7fa8Kcuiqln8EWrMORwJssHjT5qfBOG+1elIzNIkS2qpObhFW53Rm6D5YU9+8i9ScTb+EXz8CpuNpOcIQcc/ntSz/iTaOqAm3knUhKjFUux9NGug3AvtoiEtyeicEXmeA7vig4NTtyAIf5kW87/oe5BHjicEycjyYgKfiJ9qMyg/muqDVnFoGTE7wySrxRkmOXxDMjB4roAkSXzMb/mAUXlCDh/5pO280la0bRm+xHYxmcEED5N2Apbba3O5rz44OFV/BuE9/UxM8xKCzXexZFVKS2l7r1l5TjvxEatSOhGOPq7RAGubQ5UXgwGGnvfEBKwHH7DjMtudvc+Oy8lMOTgqp5Fr+m/Y25QJi5g53WMjbPRPr3B/FJX1OWli+LFI8p/eyWHM7IT2psjbCU1gOOiml7GMLE6mVRIH4WPRIcQ7x7Sm8jy6pBU4hAgrY5LjPaW5Ui5MqACAtyqsD6inB6F9fiGO4RweUaft30G4JsURLTnBcxRcGrjwEFyyiMRFTWZ7k7NK2ZWGriSbREW63u8NJ9gTzklvXJrPmTrAlzZbqS/1C01nk63Od8/a59/CqbC3B8Lz5iD8SCmVsFR9eCQcUj8EI8Y0n63jfNR6KoltIXyi274ZjJYly+O/opg2cVKQjKVmP+lkI/3EBN4WVsqs3FM2SnHEgKcL7PjJ+FFCXoiZJAjvWGcrwiRJKlZUuFxv9gzppD1lN1dQ6IbiW2eM5he6hXI3JuXigWMx7JRWJXhmK50JR4c1Z3EQ3u4b+YSBT0wg3kkF+tkHs1na8MVDszfZxwJlBYtosmT7Xg2zXXr7It3xY17RPKnZPlqEoeeJTzIFW5O2IPMk+jydf1+kSXTyZGsVl5Mzynj1ISE8yeMZ/L9Ik+xDQqKCx7NP2piLtMjn/e7ficVOZnvA6tgaG3/V2oY/XbPW+LLg2CGvG+eA7fbxi1WMS5xVwrGtP5nChvb/WKUOCFxJk5go48xKpwf2RZ4DwFti1OPCGy2a/FBs4mUbrKF0wdIS3E2K+VwEAc2v6ccLeCI0TWru987G8ZotqHTcXxYRneIQZMX84SqqRVXUXs0Ctxs3+8M7iVleJ7OEVZv9FaA9n2+n/+7sFv94AlYmqWyi4ysci+LhxjypueWMMgI2o0wuJtkcT85g1w2q5kedqwE7ERvcNw3N6+QnhucCbz4lz8n+8ady0wxnbpP4jPJI3+kfuSvlHDZ8ykPzf6j5QdtSRkU+S+ZOyzMv2WqWZwkcivf6nw+Noar9sM4gnuI0I5ag2d6EKEu9q9j0RlOhFISXhyyP8Csud2MMhLmv4coiOmQ1AhnNWa2AHxOYD1gex7N6NsHArC9xsy8Ds/7d5Xph+RW3iDG/YgPYN4f2jX2WOdQEXOE1uMHI4b6geZyiK2FdzNaNiUv7cVMzmQtt5+CgLqQD8Jbp0vS9PnN+HsdgWS+OtrQZoJjPp5yQeQF9Hhbwks7ZzW4R0s4lZcTFltttcgbbWbTlXDb3K2AyejLmPw8nsjDy2HHJn/kmC3f5hu2YAcd64t53fXoFL9IlAzNz6NJLT/uFrY7i0mDxpPVa33c6yeehcycECzqtTozt0IYTiTvuR1KEhx26196pVRKE6xI6T4spTbUFesOeKk/baK093H3Bdh0M/ylDs1PFuNqX9SVBKA7h66Ikh31HuLJi0QXTRnH0z/5MZ0xxREbVodlmZWwQBgZWKF5RfawCXcXuCpQyVN9gK9tgjA+NDg8OZHV1RWGmRy2IvNknz8XYPSqqQxy0ymtDOy6wS9QGUHV6GsEnuWMoZbaFMAj3tOnUG3lqzbNPDIMhrCfg8WCaXtriyzh95iTLyqr4Ec8AtrHIOARHG42co4Xu8NlKumDnXmoqg9dFuEUbcPEErT/hf8ONz0r6D0aqQfCArXdpLqWmaDjot2/K3NQPvKQPmWq1Dwg5okkNHiI1S9Ni++uv//6H71hNDw6+/vYfr7pf3Wnj4fIyrDufx7Ss24jgD4+iqi6yqSfopvUl8gfdtBDNOxDdRZXjjuU22tWEeotofxA80O2yMpSM0PqVXEvKCvd0V4U+XfJY7emqlF1slWwifHDXbVVbqWMfiG3qNz/PJ34UhNd6Ci4sJn+3Sx37WZSusp9tgTe9/jgkZTe6zS6BUQ5ac8ayojq5AnGFGUtRN6urAk4LNg1N2bQJrZmLY5xwEVnw0DY84/KuDmfU360XJTgGtAsV/AjC7bncn/Uc9k+VpHXLK9LUrat+C7qqX43dP6+c++FT00oe26SNK7adM/A92ejZWOQRTsl/yY5LIx5EHLu0yzObcTz/Ez4s6C4IzoXoJscPHDox9CeSwydoW5G9aRtR/hmE9mQt/g97WrDmgChMc/JoMRhAYo/Pm2wKi9OQLR3GJ++7K2rG9mizWy44Q3cJAoOyLJK8vuWJ8RNPetsjBRNJktefddZ4YUzEM0Vrq4OWekYr5ZvehnCN8ytYAYPSpIVh2h8QXDTPE8IhRlUY7WbC/4Sz+hwgYcMaZaVGsfClmLF88WKg7jvixe7pk17FlqzizDp2+FBqzht4uqQWRe0HHDLVVbSofsmTfNPwVpEnc3h6CG6RUoY2nIODBeVi/d7qCUDLFzM9sgvsWIBZwtJYGsbbv4PwQkXzuMhal5Yr2lEcDIJklkTXVVlUgLGpKmgMMUj3BnYFf88pWLG+/y/Hd1tf/YE9S7fHKV1REF7vOSoneb03eYhGIrelqBW9DsIr5myK/iw3DGcwYRQW4957ZGKeYFRFvWa5T8DHhEO4T+T5n3AYz8r2cNJZ3jqm9fBwoMKjolJ+bU7A4XLL2r+omVHstYqSb/k3JUJjVhaSujrp6G+aPPqLKofF6ZFrC1sXhyPrpwm09z/C8mwY6Gvc8mBI1BouSWIoVJql7YZZHrNWIuy8h0sxy0AMxrXWyN+6DM/2JmdkGLYMgwVRmTYy4iMG4w4q/abfAIZ+wk6976wOZtqrrjXseq8Qg7RDozgqG1zv0GCpnzXxIHQGE4Iu8BZblW+trcqetlETiofY80pvNIek83PqW5/Rb1itlkLfEUtqlbndcu5+tqHvQ9BHoVXZ/2qagizTVSsbM10ZwB3dwUFY5CCmRQSosmzKYjg55A/6fhDCFJSxCo5MBGvMJRl5jfwJxzATzVfesqCE02MCU7THq1VzCrdk5bvdBzYr2DxvfcObtCx1S4Lxsz2DKkqWnyUk5YuqTvY+JCRl9WyyY26H8OAKt4RJDFYcOKWtkpiJw6usXIM1+q8Y9fhdETepMstd7wx10j0PR0DfptZ1XI9NzQQ4K5Bd0l+BBnjVVSBWNzGlOdQjqMbaaH3j2zn3T+gwgpSks2wiPVZphY4Y4PfDg/CJsWUrGtB8iwpiqRfwNCaH1QdNDsGtH/ITDoZheTDCD5NS7umUOU/a8KwtHNxXKZsVmyXHjy3/wgw/96mjNAhvOn0RxdkFe49Pq8MzuAr/ta4eDigifyzmSUTTzyFW7LzoueCIBKrNztDI6EwCx6sMIKAQKmYEj3ZXGnH6BZ6DGCA5mdw3WSSm6LLDxTGbKr7Rt53K4+9HIJHzD82mVFpJXaWTrjBmaU1JLl0UdLgpWTf1JAwJx730fZ8aL9cb+MKPdIw8QQR6CkkpBzsEZW4zoCriaP/gwJh5FxF0sserQgte3+0UN5amHRWTKuirdhCjZp4yqViBFY6slqACruA1s0Rnl5X8YgR0e2CT3/55Wd/hg/2pH3vY9iAYeBd1HRBmJKMAPrJ0aqPCOIV0dHqY2vnDJEvI4R4RxykOEpCk3LKs0yK6VDum+60EANUDap5wNm/GmHtFD332batgWzupA99RaCBCVAAtbgx2Xnexv9Kl75JRAKuVFlufyfBXnuR+g8j+NRmjvPtSxCjvTeDs4I43bFWQBpguecLbAD6HI85Wi+AD5bCvhcJ3vdsrhbhbvwMTIOCoC9y3kyLvOSLUml/s+TnLMrpP5Hb4/VlWk+YOOuH1d2CClO9/e86Sp15du6yKKSdC+1BN+mQle5XUC3ZMlVzMEHL3x6FGMTi3BmDCfOYCuFyX7EA06G+3rDJUEmgeo5rHhyizSsYON/RGE4Y91G6alD33BQH4YgA+czlJczG12mwqtriLIECxxhp3VR6OyFNB6TVhblIODkT40qea6zPaVmD2iOGU4AMRqfWxdFkFtayerUF03TGdJstd+CA0/vsfv/r97uRTnwHrLw1rHAas/sFBq/X52bpMyAufPjoYD/zlynxW8vY44VnidaX1yDWQN1NhMpMq6U9yjW9ms4xatrVT7VenYb5pGByRnaBRrC7E78uczWFFEZM2HFDw95F17bO3jbI/7X4E4bc/g4cQYTyiJYs3PI46ZcH/xbsvSOmSkmYBp0ApTGztRl7/GYRPNd8+o4KjRcJLdKdpCbqC8MNsWtXFUbTZHWj8cU8Y3ngSM5wNNnsOQl308UMt+rg1FBB5U+3M5H3QiGd+p6KKi0CEByswDgThx4BCPRPG7bX+8Uryk/IwVe5JuAcxj16kowDob51lAJ0e8i1TP8Zz7XaphPbbd+nJQn3CZ1JsfJXOOWQEHU5Z1b0bvAq+9XXDWAkrdkpPWGWSmbZvHoQbHftyu/mP2Yw2qfKD6JRkMNSAG1yV3R/UjoWn7bgGDabJRhCeDiDRBhuEtvoMoJ4HBxQOOp0v5UvNHd/sV1JPBt46XWXGzlzRo+t6Yff3ul4suwkq2df7Auj8O2YQR4NuCB3PmPgdhPcsrRkjPMSIhw1YTIrc7RUPn1FzBFGgOa0XMP+JgydwqUYCoqbiyZJdSN5MjrkgCUeaZlCMNY8BiKcEt7aWpc90yW5Z+dpjkDXbrY2USZoWR487BxAM9um5hbSlQXgF9Wy0rOCaCQ150XDO5bU8MOSNpE8CYgc5+hteF9nH6ngRd6gXZUR9zaqygDV9Qws2AzMThjOKKy+1EWcNHGiQorzQlojNqSQhbjLeyPuAcRYVHVe0AHcHl0op2tr/9hY+LStDX/WR3cyorMro+wf8CUZBED7oGZ+F/VjfJNh8O7gTkCQ+74ER6cJ8ms8I+khGoDacwX4W1cfnpfIkFfT3WDWbuYLjk/qccvyZ7U2+96jJ70whedXSS9GCMsZZIY10SJ2ia6a8VtopkseB/z+d/8torN8I4LEpl/P4qaNUCzM2sK1VazUfITPE4KIGQIOFxWJaUc7+sws0hfBGODEBF2GnQ6kWrzrsUCqB/+F0RnJWrRllh6uWwA23rg9d9G/W0cPPcj/1JemiIFFRgT34sPuSemkQ3nBiYbF64nJ3nTN0qI2Z/AuXP87q54PgyRFdArjhNJUWm2t4eqD1BjTJ38VSnIBVPCT8r52fniGkBham+Cwhb3BpqC5q2xy0dG7oOxlcq2pWZUlOa3ZPUIjELKrQpNMZamDviYdhN/759fd//yYHepqIfYNr6j9pUn+en1yBjY+SyBOBD44it7uUatd4NGxaQn6r71988wsQQEctMU87vby2CZj8FMnGrkcSM+35NlwDJMOf+6/R1dKS5TStE8Y7o5KyRXr9uwz2hZuIms2kDjCjKWdPtuoK957PuhMFF0eDed4QhB/IeA9QUA5TtoYkgSmjGKnXkQXeEVM+Oq2hb6fxG+M8eqG+vaJNwzvj1HDP+LijDGK0lmxB0IGXND0vfi2S+QKCHC7LnzHaMvBBJGKa1Nhff8nB0WORvtT8rdWTRGCsmSU5TVt/ayADJAVNUPkHI76flUFpYCoU2T5gEVA0qJfgRQbbKaXh35VPIB1OlFxz+15vzZYQgZy82Se5YH65ZtI5KhL5nMJSVVcJU9Sgf9O2qPCsP4tPXd9/D9b0ZytveRFzAeGdNfuJtuGVVjMkugEnvFmS1qya0vwQeliVHF+EXVS5h6cIqOutd25+qKq2OQGutTvimPCTvF4QGDa3un2y7RVY0SPLLVA0NB6TX9Bd7EuWY7QchEjyoqkiZld2JaNE8Wqo/dxlKMuMIngbofXLgvdgCH7i32UfAf+lIMJZJDMYTUXFnq2Oh/54fyyvDUni4aBR3MojDxPuC13nXFrJRGyBn/lPueTDwm4IGM2wftPn8lT7hUTPbtNA8hOTRyuSKAT4osAmDl+KHdc94VwTXuvMCXI1hudYd1kS4JNZAux8KLXCJWCEWNhoQZMcr1hzCWgcX9LL0alU94IylaX7fatE7xxv07A/6IlPWg/ULKNlJ8poGYQ7ipMQRoD2fbqjM3w7e8cvTAPQvIeMlTe90jhZbnqF0cCFNI7tUz8hlE86rRg9jIujvLWvWDh08bMNJCZrKBrHOUWy0JX8zPCQ8YZ9IIjVgPnmmi1Bj7CbdqlgcBJnm/KYLykIUvfghg6YfzDZTRDedVMCYaIZ8HcJQpsgD+Lw8hjP4GZNmsoIGLVhYOIg7/Vr5d+/acphBYajGl7T6PCiblwBs8rdvrVFGW4kneRNn2scfAw7ssccoqAR3hpwjWNvdlzSftlGCv7ZWuBZyyfEr6LIJBniJv220hLUErNm2YhSls/rRRCaQUL6AahdcsU2ITF2GDjNSp1FqT00s6OoZYQRBtJflzJwz+tiq3kvwFIeo64lbyaCbR3IdkgOhtBp0VRPnCe0lGsntFvoyoIMmD2j0zQBmmda3e8kEU0FVaLGYYgeMpd6O5vrrbFJ2lQEW8rFjhpelHcMK8Aec0YaoubCny8Fk24OCqXs+p0ZCWgCi3LTIDGSz0Ry1LYk8WMhWYm66CdJ0nLXfWKMphnh/3zbcWYsOi2urusOMZo/XNcJ1cFxHfAoOZ0YQSD2bUYxrlWSGcGktFRLflY2NRPmsm0H8xLqKsMH1ZKMhpOiXOsJxTx9y2HcEoRQmAPK5U0Ji3MD/JGK0GGe0WP5N6R6iC9jWAuLE0oUwfy6OLQRQ1duLpI8Z9UVnIpggm9dDPk6lol5XcwDFUMl60wMxzHF8cnFOAX0MbwETZN5/jHEoRZg+QWN+EaczGbiEx8cnHY/gvBbFWOGWjoEVjoNGnWVjOjkr4NQWTGGD59F0NqaAwsKTN/Cph34ntSLomNbvGuZx9oD3taqddNp9JKpKj7xhLidOsuD8E892qFkNntH68/rIJx0toTWX8Y8Ou9JbrmDn6MUyeIFSW5UH6tw6Kg+DsK/dY6Dj1aJxVDzOkQ6MzFW2XFpuR/+8E6V/vAVeEanhJ9k0yL9War86oevtDXIqvKSfgiIHfGi0umVp8a/uUNUzNB9uJ0Ih6O1dDNhUUYtg46nqv6Tj1f1TKexSjjBUBzU5oV/oKwU/n2LoETso2g70oMSdQ44ZfnolQXhY4P7N6fpyU8MBwfgjd9B+CEhzSwtjs6Tzn+BROWanfWhrk5gY/krgqcscAX8OUuJZPhIQYM7S4jgiDze122EBDdp4uRAcKFJ/zYMJSJTBkMt5vVH+kUvhBvED6Cp8FpGUf4ZVR54DWd5EJ45gsPpvMkeym5h9FJY8V91gmfOrBr9hGI9y6IJ6XsXdzYij3exCfAEg7Z9wB8M2kI8LKxI1zrEwtoCfJxq0EdHONUUxOtlrRlp3V7WErCnR7SWPRurmacyo6XjGkyQgY81cI3mzd2afl912yhxJfabqolqS+K8uNPx7YtNiceQTEh75aAhecugUiyqet86tP1k2GpsmDtg3tnWK0zyuiqgVqtSgqCfw/cFZsY5qyxmn89Xrh8PkR0xZx+3kQYQEfmPnrH40cjo9Cz8JlCQcByL/2JFzQZ6xQ0ZI51n6F6vmbqvdpI5q+Xr6/T1U3bd5Yy/+/I9nszqNb6gkxcv5eYdNu2Cl+mG5asPRhJBq3rNkoj+b+Nx54O65osRqzZqykLv1YzaN62gR4inq5MMHDGC8J7pmQV787wp4aQCzwHgTre6GHMMlxS6ZlPGGCEX+E3m+FStwfz1CgZzMM2BTapX6DPNp7TJo4WgUsGJCh542wnF6FXYU4md/gMTJJ0bbZ7RP0jfNLNPykJNifH0SQl8fd0w79dvJuQ5HLHZxbui+JpRjJHb/dKX5FtH6QtP6a6z1FXvvrOGfWcN+84a9pw1TDyljobIl7Nyv1+cHcviy6ayA6vUVcO3U56SXO2CVfBwC406Q6G0fwWbeRAOBbn8wFJU32gahHcHcN8hT/x2a/+BoMkCAyKnzVz5U+ZJWbL6jhcEzvlBeFayb+a1/GvBjn8lfY8WtLqg9mRbMUtZzX4/GGsDfHwMDPX9FbtLLzyYIGyoCjkM/vBfSySj/FPKnz2e7nQIHYSDCXAGYqhbAo13TbLdNf2X71iDnDnFXPmbd6yE1g/tAz/uiPrmQXjLTF11qv8MwovixC+pM0GEyW5mSZ5ASGa21zlKKfPq2YySIwxVhLM9ONiLq+7b4FR8y8/twXdfakeCLbkHr+OksATCSxYE3blfDBSjMkUPVKj51WI94HuqbvbSpN2S8e7AtyWzcckU7REta0g6JfPSTHruuHUBke5VcZxkoAZpWb3qAhWHflR9k+T1p4+HDyFxBVQ72Q9E5urQ9FrgZaYFtVUnaEWbJmBE2h5AgokSV7IvTJBgko1z2kFPRxDoqOqNs4PHAZ9C8Uiac3G7g7aLkMZ2JcJbcEQOxw4l29JHY0g0DqPCerX1bkaVV+iatxxKfMzUa99fgXrX4kZAW9Qts6y1Fwvj60PdUoGeR+4oP+MEUQaPtYF7FeMkS45Db9Cg7QK9bQQCQhYCxy1XjRaEgTRZBQtjK0dDCrSt8eZTmkSLBvL/ec9FQS/vDj/hV0sQZ59+trmGnvnk7vK7Pjjq86CDaoehpsM3jeMt92EoWqhxg3FnAADzwo7rtBMO50zqznEYnluOn50C/6Hr7LSPXETilHV3EKllcWyNzp4rstLLW/r78SvGEPbJs6MKbMkVcNiUe+O4Hp3JA8c18iAVL4V9EosHSVqX/8Mbu+rivu9MKyPc9wp4p1e9+SV6cuw04ChCkhg0Cpf8EB1e6Jz1TtNRah+Yi8Po9sBcXtR5tOP0sNk/JIf4ByRqVNEK6gQcz1PELH3bH8hAknpxTT8OF0/T7E2MkASxju9NglBmoRCZwu95jsm1sX53EIIKkg+BnhWhR9p3n3jiQTqLb9tn+O1xZgVphG5Z4o68E+T3XAf4wg9CQW4PQGisEiiYUdGn/cKOfrw91e9cDqs7hkzk1YUoGI5SO00q2k4ODtibJlnSlOX1TZeYwrlIHYR3DSESINfmL4WQafxy3XfgaAHWm4nz0D8VXAsEU2EiVYrGRHpRMS4rA9xO6wWQoZ9vP8M5LqIKNk1yk9zUhH0kCbDw1PVhG0qCa60VXqLKVDIi9E6D1jeDvJu9iVkw25tctZ0BJI+PWYhJb/WME0Z2diTFyJeTuM1A/WwFbHzUwn+tw2cpxFGiL1xRKpJTlywIrfQFuy9FdMtSnmrDlkgc3LemUDBwgB643uWLOaFVDm7oFeb0vK9SZcAkDE9blHWS0bYImueSxEA6RJG2QaRfxQBQmI/hxhe0GBw4lBZH+doLgMlMscBecQi1FOm78U35QzgQKOZASSa77hTGTbnuYBtEu4LpBiEbF0+50EBpchFqgT6T2CkSPhlO0RyvMt0nxASWM4sZoMszkIuzfX7PI2+5v39iOw6I+qU4bWeseujJVSD+6lT8+x6cSJgliq/ZGBweG73SlurKfE2RMFx3CDErFMp0mjryJQhu0WN88TtuMbpOwJzjZM2CNfqycvGQ0cwlOfxILxJ9EetB8xMsCO/PjpKYbTqS3ClvjWssE/Zy7ECKvuwOLmXaEtt2JkyjJt1CdPmh0DxuawJc0M3r1myxvOyqKBcsPaWMbL8h1lPMPN9wpolual4pykOpVYiva0KxGIMSx6/ZxYDlPbC49Yfg3dLU0a9i4RrFT7L/zckgzsQsSmESVfFafTa1U48kCLdb7iVxRLJg0SG6FqhzEhLP6nt+EA6teFa/0FtH3EWt+6c+URAOEZ9Kxx7UObpkogPEp+CPMwoDt4jhXO2PP3thSzVzoU9k5Z7sYvuQyG5Nl4lyvLptfUdWlXbv+MwCjXFWOP2bHIUqZ5BwxBI+1XZRECp3KWGgkNfXBUFtVX2/4QhBiAm+qRXr+WIP2UkQXjWEmJav8+TCTZCirBLWqFP4r+O4tZ212pa7bQDaiD3BJlLyTbcYHZt3dRl8tgzJYS1PsE4QhE9sgUbhK1OkY5ugQ8wdL1iQoN31yiFbORz5/tpAiK5uk733ZUH4d9tjTTIL66E3bx8Y+z4mIn3o4P7VFwHQpWCtvuPA4UQit7Y6E0rzqcyrkPzENC5FckI5ncAxKuzDIfGaIofgw0GM4i9xmVTgghWiHnlOD9lvB1OCnA5Ig/COJoUzhajMlvvkpTSZQHfv5MpyiNtG6eFJsxt9JknUtiexTHrPpKuu6ixnsRg058udG6D6a7vnW4deS6a33Ls5CgJtNq1hm+r06vvHO1U6rUDvqv2efX95t2oVxuHR+Kd3qpEeHUryFau6v76zN6PfQ/KLd6nTqsNDyd33d3RScn//jt6SwjOZN1NuVfjDf6nCvHBU6XnGUTfMt33GFSt0PuMDT8y06cM0ikKP7JseFCbHuDGlEOswzwq2R4xg7v0Bf06Z9kxwhiSxojsKwueui+SagiZKmh7RE04Eu3ochA/hgm6dQbrXzoP1Ebqwwkuchzzw6OaMSW6uELKciWCONqrlI/BYa/KonsWzyVkIKccdzzlC6lQmhTuLf8Nf5zTP0zMEvmo92xO5X2dIyJeehR9lHpUn72MqOc05tTpC2mNR50avvK5Oqhj+Ot+JIJnmOUJizCvPqqpHzPVXQcz1ynRh7XmvKoYj2JolkZDQaQF8D7z+9YoXz+BEVXOPfRu/2fZmgXmR2s9iVCi6MM3k0fcFeJJCWHugae9ALL7g2BWR+J+DR9P3wlPrO1reBEdXICJjf87/2kyzpK5Z/M+iOvyyyNlNm6xXJ/Td0FKffJPPij9UjH0HVu6K+wjP4HIH4ZkP/o2cJS34f0oLj8x2pBy2hDcmxKVJ31186fbnd7T8rojZky0jJaH1M/xMgL8QGtP30qL3peRTRLowrywIPxt6soOD0yFxED5yZSwDvql+6dmjiGOSGX5XTs5yCQIl0coO8w8TYZAb92d21DIxwF2k3S3R5I1zhKrnyRaAP1yKNNxXZUov9ZjYW3y5b5opyYbdnVuIp4qW1cBfRQvxOTzD0cyIw7OCeB2eNXIUt8OzBHhpLbSgFB+thYQ4qugtdv0qDD1Dc6HmrBYu1PjL5UItPZE/666Boyh+wmuWoRwTnndlkmrcdOvy0Wn3exzSaZse+z0n6BeWv/JV2xPi9eudcICDwwjOPinxFAT3mtd1+os2dVXo5U8cJMc0Mo+Acy9pSuvBv39bonBjP+LgC78/zBeOasdjxJg54jo/a5NEaBexThM87nhmqUYKgq8UrnCF4I4VnxVnGEWoBbGDcIzB0VJxbwgg6niueV9AsrFHIgx5K3gUBoh4gnd5FKr/v1wmVd3QdKsGL7Qtpf+ITlkIC2xvQJ0a4mC4kmS4kkRVcnY5S4QWdaXJ6yQ1uddfd626KKo2njZvMslvJqTCwb6iqfUV/tXMtItXo2askkdgTxARusVhUwqVA0z91lTx1FERamqkanepYtXEScKJXuGhUaW+4rj6lUFIs3qF+Dh7FptNtzdLiyMwSIIuZl1zQSVnrwsEbanfovlEHK6gmyN0lhXsmpHNHYli69mnV1Up+vDXBRaeBW855AY739KiZskxi69bLKnCvMtvWrw5xs97DtIcaShWFqWrZkIj4Sp53ShsLXQfyfNsfMGzGL4KzariGaT2KjYbMp6hxO68Lxl1gCJ/nswwO9U1UZTReA+WHy7OKO+I0h9LPD8SrYPKKbjpkzha88g3ZPhEMuvMGkWFZLRSJJWOEqJ0cdKs6NEVyepj8suKMjjwwOMm3jJncjt5tDpW3bbKW0ddgqejiwIMPK5cCqjNiYIgtAMyOje+65ZExov+YBTbsQNKNBo7oAO/8IV+SI/BjnHXhwjC34zWoQgP2ugR7I5B+OnKV1qESr8biVjxPjTKg/B7Te5uRzoeg6EDrxrBMCp5mFFoMBebeJnrYd0olOc5nC7ZHX+oDannQWhyJKO2KfWPLhJHyISTYF0IrV2Mb35bQqwwFbCNg9fBXZ8YyZP0UB4Z7XOq/wzCy6YUEzfIIotkUGOuUo9tBtuoOQdHwB0nBE3VaL2+7ZTLII7utbrjI7Ogl8AEzwoqID+CVtmwhYIxAPzkVeI2I+6c9AaBajWVEVv/ia2G6Q0lmTAceH8I2yl2XH4o8mmmZ4E0HQ/j16W3Bgb1AAE2pmUk07QVQFwPCOD/T3XBCyl4YQv2pWC/L3guBeIe1yuIPAevCM5Fqlh80UsVy8A2QSORl7w+7gUguYJ/ZLDSmou5rGKzG1b5Hjk+5vhpL7QSQB/z89rvPWL8nBB+xYjsgdWepjfKqsmZFrlHpHs6/0PHNSYU8YMDjX1MBMhUYFgYMh3shOekiQwyvGnRQOy4pHn8HY2qgv+guHy/kWY0Dfe9pvYfHJzqP4PwgQ8n//yrcB8fiC0y6uhJvwI7XwI0DJ5c4t3fH5ZFCd4VMpoIubm7wCJpyoI/X60SiaMlqzJ+vH77JD36r5V43D3BRGZ8ZxCulNnWXZdwEJPJO4Pwbz97bNIhO/nvP3ul4JQhsjwH4X/7X1I7xi0E4Rf/tZzBeID921XqiOuCyhViXiW8gUwuTR4PXjsUN9Vk5btGbYmYK/j3/3mnGh79bInppEemcBQwhf/3/58eDfb3O6/v4pTcRgCp8LG2ALKK2iFnaB/vp2EApUvwZDpF/VLQOtac2RyS+LZmuRGqu3T6Ez9e+ww7vGbl3hL6dzYnzafEIsPClEN7k6crsGZ25b9ZAY2OW4JnUxIYAK2GaLsFSyEL7zKJWYFtJ5pC6D7o9Y3B4htmHJ/+67IexIfO/PFVbS2FSC1svE98+Stgm3rI4EwfsluCCo4L+V/Esiwq7rOUCsmITt89GgDXtehCg7jtSk9QzC4boYiYmfqeVIgEmw14QQhaBCBtkn9/kE0h68bZbMox/QZ3hipCHgKnAMx+a5D2oYSzRJO39AGUi45SsTajtbALsha1MxgBSUjGaVxG2b0RWJLRqx1k3iSxOBfUrpP+juim0uRCVYY5bkODiKQiItiNVrUVZwnNYARgapysEEnWpOxBF2aJXbLcE5576nEli5lJz4r1it571Uh/kmRxVO+9vKlFTfaCN1+4ojC7+xHp9C5P61Szr7uuArPQvX6EpkrvHcv04WvOIM7dl1u9ct5MxVOIMNJ+3RSpohlukZO4oWmgQ6S9RfQdEQXaAi9lVMor6Y60oZVYfeSqJkLGXcBvq6DToXQxd/sgDPVitIQgn6LBavqJZyzQJ06QSI5AlIs+q7hw/qwXIeBpiu5+TO85MhJXDqgknwPz7jR502A8AjIG4KE4hvPkYI0CMjl+HgvhcJ7CX6HLEmqbLZGJ/Vcd8pOOJJHZ16JZ22JRvAu5YID7GPwWayC9oBkxZkzIxbP7/Kmbf/zUVRyEH+IhyE7464Fg21OvzMjro7wGT+0izGtoo9qwL36vL7RLtOvFcpwAYaT0h96zhRiAAAmkTz0SzNjjuaZ9Ln9OIwi9nCaU+wmTRUAxzY0bOTARkHU9WiE1EoZtyrDkMWjMqZFmFMief93LG9qVeqB6iUihmBxb0JfOWl+6an3Zq/VlW+vDUapoEQB4VQuVJsr6umHETxt00C5+pDZTFEzO5rXKio8QSdjb5JIkstsd2pKOS/uGzSKNpis4Nb3dUUhrQYEyqjEvn3vo/9X79AQWPbTgmGZZectRDiFgNfbXGw5pkgOn+h2HRJnyoN2uO+RxdeJ6DOCkvtwvv2cWicS0KrhD8lG6OK/nrL7vjmWH923dsO+6MZCfkYkBs+lGTNk8yc8JWQ42LSOXV/1CRpO/qquGvZY/jEB27Mp6BLn0qr1mgOBUFHPy9CLvcxFcbAegG49RLpK9fjz9Ux2SF1kSIcu3nbFXPo/x0DnLiroqcrJoo+Xxv+c6qFOA+yH1OSiSZEbvGhdAYJBMxgo0skise6uHgGTPSmowDOBQ77+nwTCgHJhP+4VB+MqFlH4D4nBZGF+dhWtdvhTpE/AEjhRVrG9XaZf16jd6r9A/bVuBzUKhvA2Mzysygw/SJSxOyHJvjC5h0eQnDc1JzHLu4F8w6BIUU4OgvLA+sPTXnuWfrnxJR7OAFxvfdV7WE8ezPzMwkJa2mxwd8BcG2wOGGlqDs1tXkfCc5VEQfrkKR4R0fNJC5CECVe1baubMdj3R/MW7Rr7vhJqj7LZJQsHVcJUv+kAXU1yAHeNZ75ZWpMaaIeqiYM1kg+LJ8YFUXRiV0uSCjYeipVyJBBGGwYNxyRAJXVkvmSNZWfHazW9hEyv45Ls+eoxTt6DNAiEFqrfCelxlW14ZKHVZko8A6PG2EyC9gkQ2jZZgX8XNo1uidg7/sRCDQs+ZWvdMeg8ax9ftcmEv6sElE8gzi9UBJmgH3QWg4ejQpqEw4G3W0iD81MEf4iXF0IX+FA7tZ3DIzM/gA9DjL0b5SE5HEEH420FiEef17bWPnUwbrmtaPdTCam9rc7QIgGBjByPay57c/wk0WZ+zpZ+ZM+bUZkvxtkD78ndtlg0L2Xtlk+UjiY/5AxtwKDOiHhycqj/bxKoulPrrv/sgPwtbSS9vR0vK02uDHhmLRFhpOvQo4g0/4hNLJJxs25a2yoPwvgev3269xaA9R9wN/nxqCvr30oqDUM7yWn6R+RsqlTS1aagYnCVpjpLgICgyhNwZQW6bcpPPQoUC7wyBaIpGuZopAisbJiOZpwUEVwQ+DDJwsw64ZgLF9ikrU6u8TdZq3TxmNbxoyma1SvBa5LKD4wPhziQW+zUuzVNJvdjqQ7RmTerF1Q4gr03qxXpXqO04OXvj5qdpt6Lu65J6IUeCzAyqotkXtGQOSpuKHm3qpUI9aWXbfZkwX8oYB5EwoQ8SDD2lbPDezlxW2yOlwaaDI3qw2Pk4cpAoaAkImcKm896yCWqUWVNQzNy0pOrYBN30Ni2hvhewLzQoFR7Ywn4P6diEWpRgCpIth94qIm+QCreVfcnJlIOuDOsuADT7pkuAxFJBeFnJuiwicmZT9Dr6zvCmKZKpFcyxZAhhQFkcPoIoQlwJ1psu5yy3kNGSRT22HygMwiuHSwLHumLFgb+C8Hq72GFkjuLp+0iS3xGe1M11cZwpYuvrQg3wD9Hd9nV41ZUa6LJZCBSaD4wi6Zkpv7Qkp+BdummByoscr27y5E3DkK8lCJ3UQoCEAxsnLRHlwsIchLc8YhG4b3IeCebBWvOO/KeR58iRTrCTj6y6JvC8aEqxWX4d3lfkR+BDnTFnzuw1GyMJPJ4OECf1yzYUiZIwrx8cnMq/gnDHya9UQ1YknVPpuROGtO9lmkQiy4p+gbveDKOqNOCTQXqnojLqfDoIhkMiHX3XiU5mHf3TI3dCqThOeq+jKLSQtgoIWeTMCnxZ6lWlKqCopU6N30H4TMEwx6NBL3XaK+tGCHAMyOmuYpQXmNuJzWZFVW/3ISrJVIe9poHQbxEJGa53XFexmLfBM4x/mHDIgVpeSN7sgbuamr/k71YHuAi+aegdWAkqr/Xkza4rodbkkjpKbBlp7jtzbIkQLIy1efTotTsPF8+debhGwCLLAlyxKriteWcYLA65djx1tlnDVnkAEzzyAC1YPcBH+KEysf5exB+dNyNfd+Qpi5ppEu04yMsc3GU9jrM3Do6zN0G415ZJLnnwZrYY0UxJEO62klYts29gCPS7aHnZrUtMSRDensuJ3gqYkEP+ZisWkTmqKlpVyGWGzG0HB/KPO3aBFb8yIE9H5MmIPHLLlVQE2a315RCG83qzV95Zhq/1ZHB+2q9JtM96r1x0xNfXewLM5G2x3e2+NAsSRX+HJ+iCIG/XR1R36hYE4SANXpJNoiJtee2u6lik3C+q7L6H0A6oqYDKDhb0fQ9GVYyHAAs04SqrWBCGnouwMaHqfbVDeOBByvCqmM2SnPErLbseP0ogqd9sb3KjLUPrWzEThGSzvYngGxMn6SXQ2wC/NMzhV20BcnyIQpkdEP8ThHnyVgVNRHq79hbgCMWT/JDLtIRMrBjnBRcfHCLCSZK4KBfUKTURdF9NXl+Q2QuPpJumYA6EzFSsgvQG8aYqgM1AMm+KhrccLZdMdr+cHZ2XJVXMjxK+uNj9TOZZkcQ6+d8yYUdXtN9gLQcHlBtamQoDFK10uS9Zk9kVs6X0ZT/+FP/ol+/3ytHFXeC/7Zfv98pfePAvPPh9D37fi3+u8M/tctd77Xvea6Ldd70rF/kr1A16AlXTjU4gvenVJX2JuuaSlHTEj1dllsuaafzlt4zUl6jMICMFwW32uiHVkk/ecjFEtt1eUCjGJ3k7ajBKZrNXjPdDal7RLXGrvohAZRNEg5ARclbuTdBhstx92S+dzszS3ZcCuzfpSgGjSnedsazWmwAe9l9onbjnpqxM6FxEnM32JuclJJ0kGdm1mBnVnCoSnqmd6RMXRtjdCFsiJetJHi2qAswSJr+itMhgJC2G0FopRLu0m87Uo121D1zijklVCrY9KAYLlXJo3HCApN7tor10JBkdYsdM5Els1FS/7xNUylbrDCgjiHUfIOwLNDJK1SwwlTueQiIHnsJEmN+m98l3HZlRMYZHS7lqsmhedeVSNdPTymuNy54aCDHGo/pYHVG2zKRiDbvhQItaPxAJsq6KMHZ+KOzAYpU4J3TcFE5BNpGptsLZwsZdnk/zmbL2yVTK0kAQmFQebTB/+8cFvJZGykjz/qxix+WvYIoR24T3Z+CCdk6ZNZOMvT/Liji9i0qH2y9PKHcfzDBq5QrLgEBEkKVIbpTLJpcoulVb9KI5/m+Vxgz/v2qWisBXuxBSbqfXWSaSz4LWD98nRp/FTY1dNOa1JB0VYTIfqekU/NOutWZQkUEL8gkF4f0hp0SpwULa2/onzuoLsfSKSJNpRauTc9LLFNxc349OopSdhTkJPhNyIKr9hnDEElzfaPhRTll87kWBO4+Dib7Dj1iZTOAVI++uIMRo2R60nLg4qCDmCdpxwwGQ9uB1hwgiuY//dTgpLxy3H7ZMjkOgb4cx6jBuBVQQfudDYew64fD3UGU6LAi/HoZldTlaVVaXo0/F6Dxle6NVCdhobcqJZKQ2AQvCf1uttlVQ9x0gzKCNGGGeuOfD4KoEDFVVm8GZ1YbJ/LmXmtYjuCjm044N5am3BtIejDU52g2alD32o6WDDe5ZEHvH4lOB0SXXExhjfMOUi5NjceKhWE07856ctuHCuz5hW/U4+W49HyXfref1xA/xSVqWWD/zrmDUXQEoTPNDQC2h+QocvcLUfG8AJjkzn2sQ6C+8PSv1CG5q5RpHrzhpue0WYmKnImbX+xy+0P5P9eLISXrcFgehYm11Ef6eemVBuG7IHBS3SmD8DMIbJqFvEbdMANf6EhrH98xS8L6yS9aMAnE0BQ2h2kecNrY+Q4qUepgi2LSzveU1aFt7vNI1QlF6qgm2tL/R4mRxEQXhZQOBtg/VeC17GvoQ3bZKLbLkG5YYvbPwQoPtV52MkjipYIrC04FHLkT7gkZpoBciQXEXNqZIjJGUetsGosfjvgn6xE9ULAZ/UWntG4SXetTDN60SaBLhBj7LJgYPMvIYsDTJINqWG/1RyR1EHwbJM5qa8oZ2JOuqbZHisPsi+uiSCLooIGweAks75UcvVLzg1kExUCWe+kRBeN9/VTuKbzgIkY9olTXlpkOCrQeO4Q4ZrsdNlp2Ig/HbHgitKrQ9dmLFX4w/FF2xiOKc7U0Ug0SbefmuWx6zFqGTOItDeuEL8GwFeua4aP3oh+GCnPlU/RmEByvANdJTIKbKeVlwthvvWZdOlqnuwSuS9LKsLCo8EqvmLAifDjJC23fYdqLx6TDyBM9LbmogMSJbD/TM5IDWCKeDcK3PDo3OTedxzYdz9N3J85eTM+rnv74TG3HNqszi6vr7O1UkM0zi6kyjmlU/C/dyXuTIlfzDVz/LQ7bJkiLJjmrV+sd3qzUCV6Ee2/T378a1jUwXTr7pdyTvVh/EXel//BcrHXjed+uRtC7sHvndu1XEYbvd5xX/87vVJj3+kqX9mu/2nf/8w5fki3/9/AfgA7cqvI28yV7q1V8JwwwsGFe7iFPkC0LWtXWZKpSXtDpEqrViieG81+04vqXgK+hHAoLBzRX0h5L9jisbQsdlIyOjJklyaQBhFkWl4Ll2Bc+g7wY7wVPOJ4MoOBXGM/kXu5MmHafOxhufmc44qvsfg8Lwcl9GFf9GZ7nGVBNyL4eM1zyBk3JXcRD+rnclreYNUv70Lu5LLH5tudNNNIW/VzR52wuC8IHB4a39fdr9CMINA2V48e0NMIfjggOHgoI7vCUOfzhwjYxqFfltRnHo2SMRup/WzpMt17XtfrxFQc8IHw9izWcKB0nPdeRlYXuWNnm0d14iWtKnk4Sl8R29RGWIp0k6LUSO+Os4mEuiHWJCiqSzhCwzzDF2Dv8S7OTnCJzRCltyR5DOZ5N1xZo7pcokzhdJFoTnkFozWlR5k56DuP2MlEkxmV3s/iYpML72CdEF6/nVrhxO0YV5+BrwNyZLZIbsCLAuEDj9S2k+BxWYpGcIyTC+52PpJoOKUPUhAcvSbPIRkV7E8DaXCJkBk0Ih35TFUILEtEZJ2dRHUVtyjgg7MXgpgXTOdOkZQuJkWc/2btv07F+hthp/X6AblCFG19dFknVk6b81qdFLcRFsNKTfnEarDvu+CBXinPGaxb9bhYt9QTlpcppN5UF62UxTCK+EuGY3LbtIM2YSs78P3Np8Sv7jP/40+Y0z4DwvxJb+N214xFfff7srA/WEX+5Xf/p2b5s8j9Jv6q+++pJ+/zdynOzuCwRE28BT/2y3mHlv8QBI5YGdHZY3QSt/ahcF4fbXX//9D98xoDv6+tt/WJO98rF+AaQFFNmYoEjsgkW4bVPl3ZZXsq5IN6jnb3cVUMyvdoG0bn10JF8YiEo+lj/EVz0nf7HjpFYwPCrZObL8ryVHaeeJhWdZD20YjcThBpz8qlOzouS3PLiKVTQ/3PRIYRG+65F1XmTqjYRgy3XOLE4bKxYVVbwuGXSFJ12C2sQcDFmPBPl0F83zRpx3I1uX+b33ESpb1Qq7xmNqPKB61QHQAISOjUqBkdMcHnEJnaVuyhS5yv80xM8seTAHSZp1TBB+P8YZPVpf8RYVJqtUmJgV/mGwwhFa66RYrZrZSDUzVc29Acpk4Sw/2fBDrjhE7zV5XFzidTNF1yzlQ3CuzcFL47vyIFOyj5CM5nSueE3JPArC64L8VxEkoc/akkzWHMWLJZm44Asy2XAUoyKXRBeFKImjWhAXyyr+/YvpF7gC/fD17wF/huciEkvRiirq39Zi0zGOdnzBrfCFg+8Wos64mwoXRUF4339Vy8P6tQcjKNJgMvHfosME4ZMV6mlvGvjArMLw5xa47QCK6U8DufiJM1ZXSeRpHikMwgdDV7b1/9aBEnoRZo4ekHZUse5r21u4vq9kxHTVjyL395VXtTXvuTDZ1PNVQeL+luKanv03CJ+Pgi1u53tjF3gYp4u8rgof97MQur9oe2Vb/8NRXmpxAvguzNfAovw2zNfdlZRXQbj/9he+zUU0h11ImURB+GjVizytqtFxi9Z6PYJytxVRS8iv3+nyIHz72+JhxbvfVnCbv3zr6/D7Tt72sgH+deuS9tu277bqzbRe4ZqaHZe4gcIuYc1tm31gy3ivOpbwFDg4yOghI1J3hZuK8tsWagbbdnjJgwPwL3zqFOdN1otaAHToRXdu/QJ534sE85fA2C/QYVRIBKCeuFG4AcUopu5nx1vuBkN1d5wIcULql08xkgXkzvZUz9H/KOjD2fsoahr3s8Zz9RwtMXwJrvisqpjw6lMKj/KPEP5KuMdSbW9yu0u/DKnePHRi2rQaUZqITcmWE8dFWnPQJdw3Q0C7dQucmDY9XJLPU4YvddcDZNKY2Q0IEwGmJp9MXGm9R5txoOVhOFc1cFCOJrnzhra6e7ViEUMPtKJOZokIkb1scK3XbybkuV20S55fslndv+2V7PZK7Kte9q564Six63nRq2e/d9V+76r93lV7vasmjhL7ql27OfLlrNw3i9AHv89lf8yBy/6Ko7xflqfrTs77is2u9wTO4okovtJmbAGaWzGotnys8aCR/yFJmZd+XhAwf4luEMmSbQ9Qx39fJRmtToLwiiSGJzCLylxUm9J9SATgFpUe4XNZRaJWVLm+b1rLtHQaQOAPeZE//Xn3+f82VuXqO+l/WZnsvs92jcX/sSLhPdhZ5C5YujX0Hk5QK7QHf/zf/5dVvRL5uhZkfdr+HYQv3vLaI1S8/s93YiYfJCYfIGsXOXvNzHbbNhG5sGUIP4u6EBEht22Q+fvxoFgkEuqoni2sSChBUvrTiWTaBm8zGwW+cxmLE7qDEmVMoKIx+2W3bH5zwwTRZzk3xI99xOPAz9ssU52k3IttGdG70mcrYSGcGjHPffAMQufmaZJlMs+7FH3qvUCmCffxpXvvBHMf0gDEkJKiE/kvMKnZMRB8XiVx4L0ACQK7ov1hoPv5n/guEr3O/Ap+MMRWRnxvpc8rGQNX+rwzyJGGiSxXeg4IGLPBn6yUUbGT3NYZ8GXYgrgaR8NNk/O+ZY4tExaxTVOITmLgwgfT3EWdEV9QaXd8+BjoIiZeMILc1ljxHaPsCx9p/tEi4WWXE8GPCMLHo3V0pd/5sK13Fy8PB26qw4Lw+Wq1daLPBy+gYzcG3uOxGrrCp96EBMpZTEd/NZ6+wPtwChKET8ZrscfKIBh6lzInf+ODZ0lWiPKBZ+xAQei9sV6TPdGNwPUn/YvvAkUxykvGMIXWasAgnKxaoz2JrnCJ/uTe7ycOGBujg3kHb+to6H8/gRgYvG0dK3ToFqu/ytc+dFzUfC8vYN72Pl+LCULvXbV6unLvXYG8v6iywSmtxQzcVaunK38vo0l+XmXc4JgjQfsJloyr3U+012Oc4Q2zEHkXhM+RBQc6t6KC3AVdKoH2sFPkUyAye8eOG9Rm8pCw+24YxhMozAM3Rm0LJeqeG6U/0ys3RBwfv2mSiik9Uc+dIC9+7r9YLnTgtJRHJ+qCT/wXiJtY+Md+POaEQKoWif3Mj2XHkDiBxeqpHK8CfQJyhWhdRP5UXUT+NLuIVmh1EU0iusi6KrTTvlwArjtI0yHvrf+Gm1/Tfnd337BKtdvbF4j73zBTsIjNHeZgueFIziKiSywJJhhxSoQrFUo29MQjZnVrlgjrK+Zz+xLtPvYleCPHJdoD3FE5Slwj8YguB+VZubc1JIcbbrsAgl9IMADCXcZBWbn3YBQ0fD+gSCRHI/dToMH7KRDc794wCu42BsnKvfsjELjTLS8GbjIgzcq9234pVH1fy1TTEmyp7iidEXwY7H8jGOxwEqMnzLG6vC2yu7YmwhqXM25f4uraIMIRz4umipiqeUgO1TwYkHdTy6MRlDbVjFUopp41NPvxRdGkMUHqSHEC8MhML2Nk65S8b0r62IQ286zDtDm4ZHb1hz1sL5NNM89kTpWuDJh4ekAo7CEF93ec0/5zPuxlzHFl0UEiZdNljx8lMvJHroUvegi5tDmy2ygRsgH7rmprHsC0qXVu2ZiKazU4pe21gS3FtDkNbK3MRDsP/EANdduBGhX7cwRB5tAk5o5WlBJHjqD2mvaufkh7596DZZwOPTeK26s/64lZJjsecAb0Hl4XB+HD4avbhxjBtU/zxQBOMLQPPZBIYfRotI72scah7ZP1fF876OBDGQms+lf6+6iOap/iaR9Fc+f9ITXUHTfaP7xSOiZtn6TXMQ9FagJ3fisBwaQZi1UQ7W16ryD8etoaPHJ/g7U0+v1iR4MpIn3f3YS8vVvvI0J+Zm4/8+MeKnVNE5i6qzd6o1SfHradHtkQxqGBfjfotu1LYqbkQdibZ63r2xvteHKeWTPSMMw/MymYZyLQxY6ZybzaPzOZOH9/b/O5tZDfuiHDzysf19Mm9tMOw/zTqIRhDNfg0yiEYxrt1eGfRntQ/zTaQQcfyjGN6lf6p1Ed1T7FrhvlfQKHHqWu8M9lCuGfHQSjJEwRWj3PRnL+WavdcIpAMa35q7Tj+7DKNYA7uN0ldbqR7Q5jAxzlgrlM6aJW4rXjOhJmpuv9cuBRccDRu2vDLK9PSqSbhks23SK8zCPDl1u3ZEVJSqTTuuESYHV3XZKWmgwqdV6Lktt9CZwyzSE3HM3YHb8Ybz0g99340PvQh6MPfSgkNy0JpMVDwguoeNsjNOr21eD8BCDEqrccAqNa15UosLIUtlkNRa+76ZPCd/deio8U+qS6kVVNRMNIfJTtMRSMo9Gqht/Z1fE0KWZGtDpWllQFxM6Q5UQ8522/3NFvdbGr3+pyV/9o5YK/0yOEG/suxLv6hK7uniW5Z3wLydBQEQjXR+gyY2Lfuu2V4o0fecW93rUzCsWmezAKg/41XpmrC2kw12CUC0BJyk2XQM4ANx2ytm+6asS27qUZhQyj2B/cEmj7DafEtaxIEb6U9exdSiHO6g23DB7DI4Ln8NToWqiUDJ/krkeGwxedOq3mEglQHY0iBK4Z1syZCu1trcQx5sHrL9xQDndyFMM7O2rB2zvKXV0Jy/E9bUHC5Rxh1wQCuLPrAteyhYLeKNsaAOFt7wwAoPmGKnC+KQBcU4wQYBtYEpHEFp9m3SWBz+IUOCYkIegiJ523wuZ74JL02u/uEAofeWsIAS04WAW21L1BhL/J8OINpwQvstoGnReRi1M8+S2vGFrcL3U0uybFxvWL8Znv+MX44MYgROUZLzsvinMZkv2x+om/jIygx5DYfjTDr0LZ+Uk/0UFHdNkZpGNIlNTLuroyXj7Es2G8/TjGm9U0PUyY4yFGUK73Vyj7hkYC5vqFIMmqHPccB8rbPvQA7TvfNXGOWw4g5L22bMRge6LHpOtGIyh5s8CFEvtU5HNt/9x2AQcbHoLsV2pPDTiYFrrFuRINr4B0v3KHtG9uP+Q0ZWnmuPUoTt54x42zb2vCsiJNM1dW6DGYvOkDJ8y+52MTRdO0XiT5oXPQrISVd3/kxw63NgMXDjDKjLS2A+ds7RY3mIG7l4dZ3vO+AzTYVTFhPDLejc06OnL02V6u8mwvRxJWV3m862ive33M4MRTsRmN6rEpWqEGnwhef+zNbIzrqQVm8MOgh+gyzQrX4hL4kINDVALHhqgD5hqiLWxwbkVULlID29U99gBds/pDD3ZwcCLO3YL9N3a233YP5mi9YZC8Ya+POCa3fsu9sJ7eNTCdQG8TC+BqTfzC2Sb9XjC6qvdR3o68yqqugKO9fbJaN564unGvOSbubzGK8/W4yWo9zqUZ9DqTY042mlZzIh/uTE6gSxfSgPadjamudGoiQxB5t7s9yGBTlSnNirHB2QO52lOCBrs9YlxzwQjKtfIo1PgNXWv0CMp7Q0ePMataJO7+PoJytugicbXVIMZTj6sJBjGu5Vdg7Nc3VMCS5vNGxF877rgKVN449EIHJ5ySxnHKMERosNsXFbp6DXf7HsjVuBI0OKcWJcvdW4sxmGvqbWGDihCgaELcnXEFpGul0ZHDzWsrYM7m9Whp9x2gQfUSMGP928a4+rfAjL6YaywNg3wvNrYnzVlBpqyqHTccxbmWzw5n3/a5CcuKuipysiBerefJ0AWDHbMDj3VMN9LVMXXkSIsK4HiL9nHuFlW44dvSfMqS+age5MI5b9viBjf6Zvjs8Ebfh3Vt9E3soB6Tla7eOwRx6TEIGVx44F8ghHSPllWgroXHgA5+4QyI/mjqWot33LjBQdIloBgbJG6kS3/RkXhH+V/gA632hKPGOjfSNYx15Eo3f7676s2fu0wizuYB5GjzPHdYT3ZsYFS61vKHDpjrK4/i3N1L4QaXMYjpHF3GeiD3CyDItUTcd+AGdeeMpWnj0pJGUM6vKVH2Da8YIFqWST43L6TZlI42jQ1y6WkIGt179FHOkUGT1Q45nEDnh+uAg4ccih5e1JamGBqy40T0ypwVCR8D0fI8VDnLdp5skW/+TP7wzR+/evTEOCGR0/Iduy6REwwDkOBo3hj14m/PhmG7hxzT1SRosPPi3/tjX7uPcnVehRq0TaQpjalHvx8HurqEBhxrs3h0iPRAnoaNHQ1rdq9Z5jEhjcGcd5w5F6xBjGtwp3Te5K5GGEE5P7dEDSo4yMcrAlzHFBwP1PUaBlRf9UIvavBjCdbg0eMsB8z7dIdjx1k/JjlFFY0sXTX6sK5usBLW9Ql/XGXV6IFcHVSCBje8P9LEZZEcxLg2vAIzONYBMqop9EDuF0PQ4JwmojJT5/B76AEOPv7ixN0pHjpAozqMxA1qposmP2loTpznRSsgXdsthXTPgqtAXXsbAzq4t5lXxZKtYMV34VxKaocb7OXzqjgc6+U2xtXLBca+1W9MiGQLkZGbp35hED4durL3uCuiXUqfjdbn5ydDwMGFpAO7JqxVoK7eZEBXur+7ozibS8Xorda4fbSs29lmCj24rLUcWCMdu6xzVhyPrX4OmGv1a2HDo6SsRw33AjP8hmkmAnhGHr0Pc/YGBXPNqXf9SPnfAydieI5Ks33PBDmKc37KFjfc+mnm0vkHMc4vhBj7VoYfHvL/dNS2o2PHhg+uk4geW+Z7INcyL0GDLosykQvlPIHEMy6L3cp414LZx+u9q9+qBnRwlyfgY2p/H+XSGRVqeFwCaM9lrx6DOacUBRt/yVFzokKNVzVqA+mjvDcc0yBnNI3gHMBlGBwHurRDDTj4qgI39qp9lOtVFWpQ1WTHtMh766hL1XQjXSqHjhx8WwEce9s+yvW2CjU4EATINfTGYK6B0MIGFxXWVMUq528unGtR6XCDGhKr8oTtkxcrqOYKOvqEDpzzCVvc8Nen85SN+nH0Ua7xpVB4l1czmnL2Wv7aduEG17EYWJ3HligJGpxHNN674XnECXS9pwYcfoWi5q7ZaxjkfE8BGvyS8Syl3LVvGUG5ll2FEpqe4G3o/n7ohQ58dIUbHASKGXZsELhwrkHQ4Ya7iIS55qRxoMs6pQFHPQ017OAqoXB7o+d0bqRr76QjR70Oe2DXuZoOGjT2KeAEfXyGDXg+rGvha7GrfkxXI7nv/hYf0/H25ohmUTK23bAxru2GwAzfalq5NrKDGOetEDM4kKIiy4AZffRwywl0zbUacHBwRMWCVcxzvLAC0jU4dKTrwwc+8KD6I4Fj6o8D5lJ/Wtjg2hAV86XTa20E5dLxFGqkI8SML1jqsp2OA90doQUO9vYoTcqx3m5jXL1dYIa/5ILW83FnQAfM+SUVbLhhFzRjKXNuT8aBzobtgIPazDQtCte7DoNc2owEDfbYaVLnzKWuj6BcPVahBvuNR+u/aWBoG+mJ/C0+IcQD89seocvKNqUJUP2tMHu5ka51UEcOblI6oGsfsArUZbUyoK7Z88Ew2nV6aaBWfCfXRLsKdPgzjfl7TmkSLRo66nXY4QZHA/WFu227UCNVRXXiCi0eQbkGlkINzhu0itioB3EP5Jo3JGhwTqYlq+rGdaY6BnPNyS1s+A1nK/hI90DON5w5h+u6hgHyK8zDPW1milVDCmS6a8FKKwPbs4yWrUNPRkujWLJPZWX6uSwWBMcVi5qqgvTTLQPW6TAAOdmGa8gR9mQMBgS1IugeaemGwRirj7ReLhwkIoYGQVZtT10KI/l8a3pvHHfbC2FvSJX5n4a9QTLVLMnHMfR4awhzyFh5ZwgQJ8vB54yGL6dx/MgnlyXTitHDuDjKBz4AuoiJtIHDmFmTpsjxOoDBXnHLB0EK468Mqcb95uvJDkgQ/n68ljHECx9g4AGQts93ldaVt8dQ0EknfpBPMnB37TuOocSXHHjG7lv+1gUa/lDtN/p08NoB4WOHzH0zJPN0YB2FW06g1moDANFgd/wAbCtJy6LnYocff2NM+j8cLgXFKBCD9hrRJWyHm/tKMV+/HIIM1D10mT7FjwKhRze8nWLcQLkOhH2MswXa1jaR2hC77ZfD4NpwinH2d9fczfzDcnp80yeHGX/TJ4yTpfeZIv9lNI53XLL+DO+E9cucb6cNA79cjAJnu3eDwNEJRC8B2lBkVA7CGy4MLg6/tSTOdcEpDcLHDqn7miDccmL7k4ELYEwGLgC2w7ZTbjXEQwsEpntS0SN7iP/LKG4E8HS0An3Er4ZWw96eH/poUwc0gdabfjqIGRDaE4t5of689pcxkfJZ7e8vibO76cf+/joA5h97QCvmbZiAbnllMIPY00snjZOlv9po4EIax66u5ppFXF/T2fDuFhoYQhpADCF7OpTk4zAPfNET0ZG5wEa4Bo1dxwhgzyP33zwIn3uv8Qj6vZH2Z6MRkGjO/vCivVmp/3Wpe2ayNZZ4SGOJdY2lPxDdDdafQuORFT4eXuFj/wofj6zw8cgKHw+t8PHACh/7V/h4YIWP3Su887EHlu54ZOmOh5fueIWlO26Xbrtya2K3u7Bz4bFfwJ6VrTYcmpB7VoMNv/x6T4S9qH+3rgf5ZfR43SWDnrPmEsTJ0nn/yA2ncXzPLu/3lN7jab3ELXNOyXrv6LWv1TOu2XLsFXftUmE4EyZmvFKqbUkhU6stCt5NMUZpq+K1pRCQ1sdCKTLcO7Dib2H92/Aj7lmiuMmyE/PqzQFI2Mqw+9mv1Ba2s6UqtF+oLWzHhonEP8XzrPvk/xQCxbBbV8l8DpTZtIawjkcilfuSRXVRveqgIrc3IciVHzFkICU8LY7gwsWr162KpOot9Xz3pGpS1dGcgHVTJoj5wcwpP1s78sUohZ7PZQqte34EXYqv6IegcRcg/vuoVF03LYTx85YlxCxgwCDNSVKrgwZD2noHcwIzYg44+yEsXFIvrlkIkTRMtp5MQE+iJTCFwlB99mOS/0gPDpY0bRhpcsg9nbOYQPfrlQXhlh9en0C6rcAPwETcTZLWSQ5KtR8I6TCXNGV5fdMA1Q3wuba3um4KVfGGXVyUrKJ1UX32mVd097N1W5QXOXvT0LR3lyRfFofMUcxZVa/ZxQvKySE7uW2Xm42xaYspJ7yuMNHYDYcMsq4G4X2HpKhiBqlEi+mPLKqDsPdelEN4lqOZgKI9LWjtvuO0KFL3RbSq6In9PcXDA6LJkzcNIwvKF0F4ywMSX+6uR9r1h3sehNZcW36IaLUBgHhJswuLhtTGgyoIwgceoPl724MaaJgOJBrGV0XC8XKgMg3C2x6Q7IG+hzU74l0PqvsENzwIan0cTdJ9nEd+iN1xt/xQ8ZnMMQPDtWuw+06Z+ap3nJjuRbeccu1ldgzA4RGt5lo3kb/tZ2lhxue/6caIl9lyC7snNT9akve714YLIWq/5xINtZSEaA1hds9Zk0daO4if9n0UyHjKTSdEPKZbJubiO05Z1z63nfJ2QjC/I86B+vOL3/Z3bGED37HFiFe47RaqhWbbLR4any1I+xh3vAgxbMzbQJn2suKn/bEUaOBjKYhr+CmZ+SZbToz2ImYluMqMtHeLEU/hEZZFSWjtqd2YUbfcmK5jrbsB1BqRncD3mXSE+Eyee3fr7RMJaHJanUDi7UplSD21i7qu1wcvE57Ud7xi0ZIPvHJ2zKKmFhwfahwJNS1NalbR9ODg1PjdfRYLZs5GllC/zccKUvzIi1ytKDXjtdkKVkm3xvag2Aa3fVJzCe6J9Ud73oKq/lfpF3Zf2XUBPtXdAYB4sIcDCP3ZlFYjFZ7u85gFXTPZQHNo21L9VvdMzI8FZOEoRI4WlrG8ZvFaC6E1FllfQSvXa1a7FV7iltVo315ZN8gccLzbll8u3lYNMp4mEbNuZxV1g6wPNgZZX2wOsr7cNci4PJ+QjXRq/O5mZwuGD3LTLTMHoCV0fgThs2S2il2mfYQ+3PwIfbl4pB0/wDX4KlYvquIoJ+wYkoGI5+oXdh+3oglnsQm3irrNZlkVYIKw15i22DUOTEOH0bITJySDLX2lvSmh1bwBvLZxti6hUVV09e44QViodxP3E86KSgO5IUlaG0/YNacJjIqspFXCi9wAX3eBu62XVPe7Scos6CYpG2hOUrbU9XEkxjVJqZvkRVH2R4oaBr2PdXBw2ivrhoEDbgwDh9wcBg6A/l5qQbQ6BDyUWdI1Yg9qTMU9qbkg9sT6w6jPnLJj+MoqU801szjh5Kio4vVeKfDIzFn1eyk4ZCeAaweD2eYD0iAMV6kCX/vRKkjRBM9XgerNoZpUvpfdbbd9Yr2OFjQzPq7+s9vvmSB8v02nyDTAmDL97qqXJjHL62SWwIc67X50tiMdICq/45DoVasHM2Yfa8myZOaSZQn1utvrcTvk0TktoX69mtvktKc3vF3U6QF9sKEH9MWmHtCX609k1eKdThxyczpxAPT7XJWwmM1ok9YE9yOqn4CROcnRima9RDiA4Mk8hwY+WoCx8eEA0qV1QPAYjDH9G/TKOs3aARdPeEEBaMnBgr+u/YaZqt2pBa0gTc27GgWdLmAD8Xvc8gjNBcuWuiZ2xBgzn1XSTew9qDGx96TmLNQTu2YyPEHsv8+OT2x++20fzNXTpynNDx3PqzrGNOnvuXpl3TTkgBsDxyE3v5XYk0tzhKU57BiYTo0xfnc9xoKZ05Il1JvmQvJml/CiqsmCpSWrduZgLMj4XJxaVezNwUGvKAivzefNTGQTRZZO2Pyw6gaWImOnKGh9Up/M51lKjth0XjaEL1CWJlN5El/+f+19B3gbxbfv9LIzuya992anWpZrSAJppJNOIBSh2LIjYkuOJDuF0EtoAQIhhE6oofdeQ+8lQOi9hN5CCZBy765kW7a1a8P/vXff910ynxzpnN85c2bmzNnZmdnZeGmwMhSoDleH7EMIB3uCnTqtgw7zgsZrqgKx6LJ4K9HxqkDcXltuNbo0GqmtRw/3REcra0P2KmgrlUfL7RNUl7cSHUo0LmZ2S+hWVXTjNvG0IBZdFohEY1X16BxvdHWDXp8nsiqe1FtVU1kvMcRTIlQdCjYUMNcLu7QmGEmEV4YCS4tbV3XVwbLWabbNrbJfzRwqrRfwt0YgXNZIZkQrZerwha3EVwQTi+3V+Na0QZ1YeTCeaF01VVTWtM5tKpo6rmcdOQdFBIKJRKT1dZQm0yr3Ka2psoNGq4pZWr2ilUqjkdI0n/TEpi4ZdVjPsBmMVTiBuw6c1xpwVShWEWqdLcFYRXoM8saWlaU7Ysd0bIPjdU0nN27PTg7LbtiyaCKQWJoXyLX75bSmdF+K3rERfWlxkpzbhFwYmJYJXeBG9tlkXzNyRt35mZXkZ1aSn1mJP7OSPDdyRiWpOsltXFeR2vLq/Az0quV19M6N6OGl+YHlcSfb5oxIpSPRpQnDH1ieEunUjJOkN5XIq5domklewEVVXiAz3edKr3LobRrRF5X7Cts5lMRie3BSbS8XRULLLIcWqbG3MUXCCe38DMcdSj/nR3LfmD0LVePs1imNRsrsTprU097BlNoOXe3PCySigbA/r0Mzov1/9yQ1pag8GlsWjJU5o4Jyf14vh1n3zuW6brYiUro4FrUnPPpn5IcSqZ1YgaCN7Z0JFAtVOKHWfqdythegLFRrzxuXRmsiib4tAzu5QDpnotuZ98nEaFS7GUXttz0PzMRI2Ruvqa6OxhLxQLQ6Y/GawuwnZDPWZgroXOpj0ep4vxZAdpkGtIBJbpMc3AKqLBQvjYWdeeKWoItqystDsYA9wPcqRKjWvmWNhJZ5GZgE2fWbseLSsqov79DWAO3LRjy8MjUmbgEcrKyMljrwYa2Dhysi9i1Si5YkFScpGWshBW7oRF61UBWqagB6qauoR2X0nzSUffpDRsdOYeyGSX3P2LFTMGfPa2ZA2kvgG5tcVVOZCGfIp5c7ysmmR2N+KBFMj1F9M3CbRKgMkIomkK6ZIbb3dWzOso3v35zcPDYMbBlkR4YBrrDUtmSHkaEYTaNHH0+IXZp+nohk5BjmibH386b7fLYnOi3KeAPTNOY3BzbsHHVjZajD9I5p75CIxhMZGiRTxBncMqwu3gxtGdoQbYa0BpyKNS3YkB5pMjRqszjT0xUTC8VDiQzunGI7LpgpuKSDGvpTBhdsEn7cs0oLCu7mOjEhg4smK6Q0sbzuzIvkLJHdv7o3QpemBjH2+8ZiofJeGZkNA7aeGfmRFKLJBbuOHVxk3/g0nolKx8RC1fY+80y+l9sacHrr57Qg0OADg1tApjX1gAzQ5iO25nXXGNW7GT859KquDEac1u7rBUgeItK8gtMhyTFc8zZqNMTr05ydjJil9k2kPVHaIyOiPBRM1MRC8Q7NuLbtzQ1rfgFoXo0tjwzTUOnhv3khmkb/5pXZLLQP94KElididd0s7vjZIC94Wmj3xKX5bfOOkMLVB4BoVfICU53I4NduPaB5wZu5fvOGyDTGclXUEN+au3ST8Na8itMLV51o0t2be1HzYOhqlj0flDSruQOnh8simztyZGl1jb3RxO7y9s4rZ/iTiAXDifioRZXR0iXO/XbygZgkat+/LdfkTrPVGRcGpv2jjOvl/mnGBf8w44L/NOP8f5hx/n+e8T9r4/z/tI3z/mGJ8/7DEtuzT/8k4wa5f5ixPYv1TzJukGuSsS+DgvSo7YSWkSPTLkCZTM0gkXY/lLSkbUUoEkjY81XOgqp9Ak378mjMnlOtjkWrqu1lj1gwsqRDihiKxaLOULI6GomH+tdRG57xqmMFosGws7sqwcqrEoHy6i6hqmUV1TUzIwuisSUTopHQ+Ki9ImnvtqzjzI+UBqvtK3HZRDubnnX0OaGlNaF4YoJzDakX69WEPTb59Fg9vz7DGcHqsfbNXz2nWx0nqXF6NJ6o53VO8sY7Y5K5zlT0jGhZTWWobTojKdiINM6p526hquTVMhSxV4ztZwztJ+nCVeFEvHszXnJdwDlNqk9ZtGZRZai3vSMgGgnYm4ed5hqVpI/JzulaFoqHYuFgpb2ulNyZFqgNxsLBSKJ9Wah+xcleMHPmuJsTfYHcdk2IdkRvRisMTGtGK8hI82WgNdeXn0E2P4NsfgZZfwbZvIy05rK+5pXgzFw3JTrT1h2aEJNz1pmokcqOzajObHVTvc5UdXOsM0/dXLE9Sd1cQ14gA9GXmVjVqyxUFYxU2CdGBmoioeXVodJEqCywOBgpq7S3P/VM4ydCsapwxH5ItJ69O+V81aGKQKg6Hq60vzuONrR3GiueCNpLQ80Z9pAkAzm1OSCjKrvrRkpDmXili6PhzBx7JTYRtgekmbjBzFbYeyAyolfUkdvUROwNIKGy3pXRSMWYMQNzbKAdFuycnN2BgWhNorom4ezAsbvoIS6Axk8hN4BaeAq5MbBfysx4dai0pjKYCNeG0rZFJM9y7OSCmZGJXlVdGYjYG4EDcWc3SGpvUkuw7JwhrdNWFguWJyZ5Y6uiZS1mWxW1D0JrhR4nw9YAF4UqwpGcVgCDpfae6mktIIPVgSUtl8JGZecMbpUupyStgzplaaFFUtBkaVpQmzrIwLFgcqugrQANc8M42dR7jH1vHorHXUvTGO38mto6bGtQrhWTBDmHB6csdHWyNKi3N6YBvb0xDZhsvxHeyLp3m9Tv3G+h7uvwqZK1UnvdiVOhFtqqDt+atqrDtgbVymydqh3aOmyydluorbqXiLTOU+vQzq9WYh2T/S5Y9yiTndPXVaa+sQbVQUoXh5LHLtSGYgl7b3PA2U5Yd2rGAHdcLJTcYRYLlee4o1J67OVo+6gMD332dTi5eTXeN/kC796l0Ug8MXBo+tg3RctpX6coaHdYe5ojGgl1SRFjoapoIjnF4qwORBI96jnBeDRiD3MW1ZQlN2/FQ4nublx7gsaVaU/QuOp17HHlOseA9HTlOv7XLX0wEgtFgvWDi+ycDDzn2m9zO6Z4DQHfcavOjcipQ41sRp0u+zjPuu3SdRPX/rSaT+6hru+UDaRRDUMae3TSrtGdSup8iRSt6Sila4put1Is6mycSERjzp7P/nWsxfaTwLEVjjcnb3Lsk2DscVIi1K8RKBqtjAdSddRwm9mnOSb5jE89omsjREp13DG2T2ZW8hgXZ6drh3SE3R6O8iFNqVXhSNheMqryO6+ptz3eqYdgPOFrhk0B7G2Iybs6u36C4YhzY1dZE+rmJlEVrO7txqvLblBTQOpthU1xuU1xzolGzlNPKxKL7a6XWGGfa1I3RxBvlnODQChWVZMIlbgCkoclOe2WbCH7aXdn8Bx2ToHw/w3JymDCFok38o2kuyX9b+myUMTvvMQj1tcN09Bcvb0gpdVVBb3cAKkXjbvaURGuCDrEWn9PV4zTNgPc2HWv+AnU+gN5jSytilc08/N+TQCBsnB5ecMck/0rPqAZJuRMUoRi8bT4099+JUnqoHi7s9ot0YzUzaGEq4IVIXuzkf0wRv08RZKXXKRZEa1J1NTWvUwlO6dLOi8Yr387Y3ZOrzTOssXheLX9BEiktJ6frjWeCFX707R2TeeFKxpeqdJYzHGONLF+TXmJRDwQr16Snu3gTJiKUMSu2rJQ8lsKmuMJzVsWrK07+shbaRKZUtrbFZqh7A4g6Fr2vLSy90/jVUdLl4QSGQrvAgoFG95zkp3TJyMo3cR0O6rD9gRlgx3d03nBWHBJKE11j0bMsrLKkPNirhS3bxo3Yo8KYvZVKy+QVsr02quy14QrKsNVVaFYRq+rii4KV4YioURtQT2/Zzq/Pm5ktD4VM2ozFrsqXBWttytQVdXVjdc0y6poIFhTFo5m7EGVlcHaYEZPcM7Wys/IskNXWnbdmrCW5BVkLJ79BGAskiaY3jipV8OncdMbp/5V39WhUP3bxht3vxQk3xmhRiMZS2u/8jhz7SYjaW1Gu5O8Gk9m5i6TZAYzFjj1OtBAQUZJ+z2K6Z7aqwnPeatjIJiZnwr76fK9M/PzMppWGo3YM/RpTt61ETfttVrZOe0bWA3OOdceoicH46k5rUXBeLjUXv8PLR9lM4c65LqJreSlKO3RcHuacVSDkuTIMRgpDVXadwLh8nBp0B4AtE3RgqXObUxpYnncdFYkloUTi+2fHZxficWhSKA8HAnHFwcSwfiSLg41JZtk2suppYnl3VKc1Ln1jXhB+xCT3pHK6OKqYCQycqQzrAguCtuXV19eINeOzYlguLLuAfBRDdBkOeP23nWnpMmuEKxsAhnq5OA8spQ8uyE135d8EGpU/URj/O+AK/8OOPx3wKWtADc0fmvAKb2Lgza4fwvgxdFYYky2N8iekk3Oy/b1BoYjiZYydB6lHTPAG5Rad+nnjbK5YwYHaxLR+rMCnKF2JHlyn30r7nytm8fOTYemfy8LJewH/WviyYdq7ccpgrEloVhBCwL1Lx9vJNXfTSrZr5O/GquOBCtXrEyO8+OptcPSRMMAPak3np2zdyuk6h81T54PVC9b9Hdk4yF7EJCIxrJzRv4dOftmviFLX+tE4w0Swzwk0n8m74ZG/R10ILVeGkndN+/zT4SdaBVxpntaI58Gd0ZVlZWhlOnZOf5M8vXzFPYToU1p2TklLcgkj9QIBRKLw5El9mxHKGKfV1WWnVPcSsmGiZJ4adR+1jSjy3kK2pcfe10pO2dEJtnUbFFaAVOU7JyhnvgmhF7B6upGJ7M0+p2d0z6QtuSbqEzezXVqRHR2Fzr07hnozhXLPrw1k1BoeTjRNQO9NBaMLw6VdQk0W2+OheKJaCzUqTnH2WbVJ50eq7F9NOB0/XCd7kY6SxeH7N0TwXDloujytoHAsmC8KnXP7GxCa5MiJa/EiWgsbgYC8URZ3RHDuu6XPYap/2FnU48rrYzGQ50CgepU0eKhyvL6a27nQONylEVrEo6uvoFA6fLlwUXhWp/dyVPN4WyRitRUOzFtUDqkLFQdipQlj8ZoAvan4wKB2qpwoLQyGI+ndhtHyqP2xLvz3rRFIXsdryye+BsywUXRWvvQ8cSYVsjYR2XWRIJVi8IVNdGaeKC6ZlFluNTZjJbXWDzeCitbL1Jv5OiWRTxsHNxYujrqtGO6sP2EdKl9NvfwxtDymkhZ0I7twcqM8BGN4S0WvZX4+nKPbAHvUejsFkTry9DdAQYqKqOLgpWpE/XK7EnSkpKSfC9mrgezuMCL6fNgFhZ7Mf0ezAIvtf4SL2aeBzPPyyBfoQcz16v6cj2qr7i4yINZ5FG3xUVeags9rC0u8GR61G2xV90W+72s9Xup9XlVgs9LMtdDsqjEw6AiL9csKvJSW+ThmoW5HjWU52WQr8RDMtfDoKLiInfJIi9PKCryufttUYHf3cGKcvPdq6+wwCPPwtwCd2sLijzUFhR6VEJBQYmHZH6+e5MV+IvcK6Egt9C9EvLzPbp9vt8jMPq9Qo3f7+HUeQVF/m6uTA+teb4C99DnK/God19hSUkPV6a/xJfvzvUVFfs8uIV5XrIF/jwPbr7fw6rcQk+ur9iT65Vvri+v0JPrKesr8OLmesnmlnjUVW5uSa4Xt9jL5twiT82FRV7cAq+azC3we3G9Wj8311fY04U7vMQOQPldXdmF7qw8d5bPnZXbxZXlKlRc7M5yt73Y78oq8mC5G1jUy41TaPtcibuVhR4sD62FgbyCklx3UffGKSxwZ7nXWKFrQBxemOfe3IV57kXwBYpyi3Ld1frcW73Q3YsK3Rup0NWWAtvXC0u8+H6/z72lCtxNLSh211pk51rc24Pv85fk5XsCcgv97m5Q4O5BBYWBgny/h92F7tkWOHa5t3pBgbtsviPrYbJHcf12cT3avsDvLpvnXEU9mjDPXdbnyHpUiM82rKDIXbmHze7+WuDaePmOv+Z78f1+D4PzSxyD3UNdvrtj5Ls7dL7j0O6NkO/4q5dud3/NL7SL5O5Y+YWObvc2yPeojgJH1kO5DcjLcw+P+e5BNd+jmfx2ffncs3UcPt/defI9WtC9e+Z75JjrFNRDrbu75ruOJPyBouJi9yuB3/ZmjxDqEaX8xa7XD7/Hldzv7mf+AtsYdzfyu/dKv92cBYXuFvnzPXju7eX3KIhHrdrX1wIPa32BgvwCj1zd3c7v7gTupua5t2Kee0jJs0OKR6DKK3L15bxC+wamyL3T5rkPkvLc6y0v375h9dDqwfIoh3tD5jkN6X7FzPO5elVerntM85U4Xd1d2OcxwveVuOsttvV6DN48LsI+937ncx+9+QoCRcUl3vzcfHdH8RU4d8lF7jVR4N5xfR7Xdp/7VcHnfpX05dl+m+8+MvZ5mZpX4MFzd02feyDwebhIrt81Evg6uXDa2vRgoLomFgrUhmOJmmClTpKCCXslbEBg0vSZ48ZODwTiNYsCU5I7G+29joHUol1seGl1dZ8Fk2bNTz69OSW5vb4xITsnpyliQbiyckIsWj09GE9MXJ5cepoTKk8hk499toAEAAIEMCCAAgqY85cDASSgwAAKaGACC1CQ5XD2Am0ABW1BO+dXe+dvB9ARdAKdQRfQFXQD3UEPQEFP0Av0BhT0AX1BP9AfDAADwSCQDXLAYDAEDAXDwHAwwpHOdf76QB7wg3xAQQEoBEWgGFBQAkaCvcEoMBqMcTD7gH3BWDAOjAcTwESwH5gEJoMpYCqYBqaDGWB/MBNQMAvMBnPAXEDBPEDBfHAA6AQWgAMBBQcBChaCg8Eh4FBwGAiAw0EQLAKloAxQEALloAJQsBhQEAZHAAqWgEpQBTo5+UZAFFBQDShYCmKgE4iDAEgACmpALaBgGaBgOVgBVjrWJ9ORYBU4ChwNjgHHguMcyvHgBHAiOAmcDFYDCk5xaKc6f09LyZwOzgBrwJngLHA2WAvOAeeCdf9dt+eB9eB8sAFcACi4EFwELgajwSX/Xb+XgsvA5f9dvxsd2SsABVeCq8DV4BpwLdgErgPXO/QbwI2AgpvAzc6vW8Ctzv+3gdvBHeBOcBeg4G5wD7gX3AfuBw+ABx3uQ+Bh8Ijz7VGwGVDwGHgcPAGeBE+Bp8Ez4FnwHHgevABeBBS8BF4Gr4BXwZb6cr8GXgdvgK3gTUDBW+Bt8A54F7wH3k9xPwAfgo/Ax+AT8KmDsFMF+Ax8Dr4A21K/vwRfga/r9VHwDfgWfAe+T5WTgh/Aj+An8DPYDn4Bv4LfwO9gh0P/A/wJ/gI7wa4UbjfYAz4GAELYoAtBDAmkkEEOBZQpjgEV1NCEFsyCe8E2sC1sB9vDDrBjit8JdoZdYFfYDXaHPWBP2Av2hn3gESAL9IX9YH84AA5MIQfBbJgDB8MhcCgcBofDETAX+mAe9NfbkA8LYCEsgsWwBI6Ee8NRadbZaTQcA/eB+8KxcBwcDyfAiXA/OAlOhlPgnj1T67HT4HQ4A+4PZ8JZcDacA+fCeXB+I00HwAXwQHgQXAgPhofAQ+FhMAAPh0G4CJbCMhiC5Y3QFXAxDMMj4BJYCatgBEZhNVwKYzAOE7AG1sJlcDlcAVfCI+EqeBQ8Gh4Dj21iNwXHwePhCfBEeBI8Ga6Gp8BT4WnwdHgGXAPPhGfBADgbroVr4TnwXLiumex5cBBcD8+HG+AF8EJ4EbwYXgIvhZfBy+FGeAW8El4Fr4bXwGvhJngdvB7eAANgP1AOd4Ab4U3NdDWkm+Et8FZ4G7wd3gHvhHfBu+E98F54H7wfbgIPwFXwQfgQfLhJTbilR+CjcDN8DD4On4AV4En4FHwaPgOfhc/B5+EL8EX4EnwZvgJfhVvgKvgafB2+AbfCHeBN+JaL9rfhO/Bd+B58H34AP4QfwY/hJ/BT+BncAD6HX8Bt8Ev4FfwafgO/hd/B7+EP8Ef4E/wZboe/wF/hb/B3uAP+Acvhn/CvVlnfkHbCXXA33AMBggihCoARQRQxxJFAEhlIIY1MZKEstBdqg9qidqg96oA6ok6oM8oCXVBX1A11Rz1QT9QL9UZ9UF/UD/VHA9BANAhloxw0GP09e+w0BA1Fw9BwNALlIh/KQ36UjwpQISpCxagEjUR7o1FoNBqD9kH7orFoHBqProcT0ES0H5qEJqMpaCrKByaYhqajjWAG2h/NRLPQbDQHzUXz0HxUDg9AC9CBSIOD/qZtC9HB6BB0KDoMBdDhKIgWoVJUhkKoHFWgxSiMjkBLUCWqQhEURdVoKYqhOEqgGlSLlqHlaAVaiY5Eq9BR6Gh0DDoWHYeORyegE9FJ6GS0Gp2CTkWnodPRGWgNOhOdhc5Ga9E56Fy0Dp2H1qPzUTm00wZ0AdoBLkQX/YNazZQuRpegS9Fl6AB4OdqIrkBXoqvQ1egaNAs8Cq9Fm9B16Hp0A7oR3YRuRregW9Ft6HZ0B7oT3YXuRvege9F96H70AHoQPYQeRo+gR9Fm9Bh6HD2BnkRPoafRM+hZ9Bx6Hr2AXkQvoZfRK+hVtAW9hl5Hb6Ct6E30FnobvYPeRe+hXPg++gB9iD5CH6NP0KfoM/Q5+sIp8zb0Jfrq/1Bpm6ev0TfoW/Qd+h79gH5EP6Gf0Xb0C/oV/YZ+RzvQH+hP9BfaiXahXWg32oMAhhhhjAmmmGGOBZbYwAprbGILZ+G9cBvcFrfDK0B73AF3xJ1wZ9wFd8XdcHfcA/fEvXBv3Af3xf1wfzwAD8SDcDbOwYPxEDwUD8PD8Qici2ugD+dhP87HBbgQF+FiXIJH4gDYG4/Co/EYvA/eF4/F4/B43BFMwBPxfngSnoyn4Kl4z55peDqegffHM/EsPBvPwQeguXgeno8PwAvwgfggvBAfjA/B/7fq8v/3dCg+DAfw4TiIF+FSXIZDuBxX4MU4jI/AS3AlrsIRHMXVeCmO4ThO4Bpci5fh5XgFXomPxKvwUfhofAw+Fh+Hj8cn4BPxSfhkvBqfgk/Fp+HT8Rl4DT4Tn4XPxmvxOfhcvA6fh9fj8/EQuAFfgC/EF+GL8SX4UnwZvhxvxFfgK/FV+Gp8Db4Wb8LX4evxDfhGfBO+Gd+Cb8W34dvxHfhOfBe+G9+D78X34fvxA/hB/BB+GD+CH8Wb8WP4cfwEfhI/hZ/Gz+Bn8XP4efwCfhG/hF/Gr+BX8Rb8Gn4dv4G34jfxCrACvIU3gxr4Nn4Hv4vfw+/jD/B1YCP4EH+EP8af4E/xZ3gI+Bx/gbfhDehL/BX+Gn+Dv8Xf4e/xD/hH/BP+GW/Hv+Bf8W/4d7wD/4H/xH/hnXgX3o33YEAgSUancogIIpjY1wJCCNmGjgWUMMLIDrADcLIQL8SCSGIQRf6nveH/ZdLEJBbJInuRNmQYakvakfakA+lIOpHOpAvpSrqR7qQH6Ul6kd6kD+lL+pH+ZAAZSAaRbJJDBpMhZCgZRoaTESSX+Ege8ZN8UkAKSREpJiVkJNmbjCKjyRiyD9mXjCXjyHgygUwk+5FJZDKZQqaSaWQ6mUH2JzPJLDKbzCFzyTwynxxAFpAKcCA5iCwkBehgcgg5lBxGAuRwEiSLSCkpIyFSTirIYhImR5AlpJJUkQiJkmqylMRInCRIDakly8hysoKsJEeSVeQocjQ5hhxLjiPHkxPIieQkcjJZTU4hp5LTyOnkDLKGnEnOImeTteQcci5ZR84j68n5ZBvcQC4gF5KLyJ34YnIJuZRcRi4nG8kV5EpyFbmaXEOuJZvIdeR6cgO5kdxEbia3kFvJbeR2cge5k9xF7ib3kHvJfeR+8gB5kDxEHiYfg0fIo2QzeYw8Tp4gT5KnyHbwNHmGPEueI8+TF8iL5CXyMnmFvEq2kNfI6+QNsg5sJW+St8jb5B3yLnmPvE8+IB+Sj8jH5BPyKfmMfE6+INvIl+Qr8jX5hnxLviPfkx/Ij+Qn8jPZTn4hvxITmOA38jvZQf4gf5K/yE6yi+wmewigkCKKKaGUMsqpoEOApAZVVFOT7o8smkX3om1oW9qOtqcdaEfaiXamXWhX2o12pz1oT9qL9qZ9aF/aj/anA+hAOohm0+14O86he/bs2TOYDqFD6TA6nI6gudRH86if5tMCWkiLaDEtoSPp3nQUHU1H0zF0H7oL70vtNJYCMhPbyb7CjqPjKCbj6QTaE22BE+l+tJdDm0TtXrwBTaazcZI/BzcgvkRTKCNT6TQ6nc6g+9OZdBadRWfT2XQOnUvn0fn0ALqAHkgPogvpwfQQeig9jAbo4TRIF9FFtJSW0RAtpxX0f7p3/pv+N6fFNEyPoEtoJa2iERql1XQpjdE4HYYStIbW0mV0OV1BV9Ij6Sp6FD2aHkOPpcfR4+kJ9ER6Ej2Zrqar6Sn0VHoavRydTs+ga+iZ9Cx6Nl1Lz6Hn0nX0PLqenk830AvohfQiejG9hF5KL6OX0430CnolvYpeTa+m19Br6SZ6Hb2e3kBvpDfRm+kt9FZ6G72d3kHvpHfRu+k99F66D7mP3k8foA/Sh+gK8DB9hD5KN9PH6OP0CfokfYo+TZ+hz9Ln6PP0BfoifYm+TF+hr9It9DX6On2DbqVv0rfo2/Qd+i59j75PP6Af0o/ox/QT+in9jH5Ov6Db6Jf0K/o1/YZ+S7+j39Mf6I/0J/oz3U5/ob/S3+jvdAf9g/5J/6I76S66m+6hgEGGWGeI2XGAMMoY40wwyQymmGYms1gW24u1YW3ZeNqOtWcdWEfWiXVmXVhX1o11Zz1YT9aL9WZ9WF/Wj/VnA9hANohlsxw2mA1hQ9kwNpyNYLksl/lYHvOzfFbAClkRK2YlbCTbm92CRrHRbAzbh+3LxrJxbDybwCay/dgkNplNYVPZNDadzWD7s5lsFpvN5rC5bB6bzw5gC5jEB7KD2EJ2MDuELSOHssNYgB3OVpAgW8RKWRkLsXJWwRazMDuCLWGVrIpFWJRVs6UsxuIswWpYLVvGlrMVbCU7kq1iR7Gj2THsWHYcO56dwE5kJ7GT2Wp2CjuVncZOZ2ewNexMdhY7m61l57Bz2Tp2HlvPzmcb2AXsQnYRu5hdzC5hl7LL2OVsI7uCXcmuYleza9i1bBO7jl3PbmA3spvYzewWZt9Z3MpuY7ezO9id7C52N7uA3MPuZfex+9kD7EH2EHuYPcIeZZvZY+xx9gR7kj3FOmM7Pc2eYc+y59jz7AX2InuJvcxeZq+wV9ir7FW2hW1hr7HX2OvsdfYGe4NtZVvZm+xN9hZ7i73N3mbvsHfYu+w99j77gH3IPmIfs0/Yp+wz9jn7gm1jX7Kv2NfsG/Yt+459z35gP7Kf2M9sO/uF/cp+Y7+zHewP9if7i+1ku9hutocBDjnimBNOOeOcCy65wRXX3OQWz+J78Ta8LW/H2/MOvCPvxDvzLrwr78a78x68J+/Fe/M+3L7G9+X9eH8+gA/kg3g2Pwbl8MF8CB/Kh/HhfAR/EedyH8/jfp7PC3ghL+LFvISP5HvzUXw0H8P34fvysXwcH88n0gl8It+PT+JbyRa0xZlPWAfeIFuQ/VkHamAN3IIm8yl8Kp/Gp/PpfAbfn8/ks/hsPofP5fP4fH4AX8AP5AfxhdwebR/MD+GH8sN4gB/Og3wRL+VlPMTLeQVfzDeDMD+Cf0SW8EpexSM8yqv5Uh7jcZ7gNbyWL+PL+Qq+ku+Nj+Q/w9FgFT+KH81XgGP4sfw4/j05np/AT+Qn8ZP5an4yOoWfyk/jp/Mz+Hi0hq/hJjiTn8XP5mv5Ofxcvhqt4+fx9fx8voFfwC/kF/GL+SV8I7iUX8Yv5xv5FfxKfhW/ml/Dr+Wb+HX8en4Dv5HfxG/mt/Bb+W38dn4Hv4Nnuvbb9Dv5YHAXv5vfw+/l9/H7+QP8Qf4Qf5i3pY/wR/lmvgI8xh/nT/An+VP8af4Mf5Y/x5/nL/AX+Uv8Zf4Kf5Vv4a/x1/kbfCt/k7/F3+bv8Hf5e/x9/gH/kH/EP+af8E/5dvwZ/5x/we2xzjb+Jf+Kf82/4d/y7/j3/Af+I/+J/8y381/4r/w33pkX0+Xgd57LdnBG/uB/8D/5n/wv/hffyXfyXXwX38138z18DwcCCiSwIIIKJv6nr0H/pn/Tv+nf9G/6N/2b/k3/pn/Tv+nf9G/6N/2b/k3/exIXQkhhCCW0MIUlssReYi/RRrQVbUU70V50EB1FR9FJdBadRRfRVXQV3UR30V30ED1FL9Fb9BZ9xHLaV/QTK2h/MUAMFIPEkTRb5IjBYogYKoaJ4WKEyBU+kSf8Il8UiEJRJIpFiRgpRoq9xSgxWowR+4h9xVgxTowXE8REsZ+YJCaLyWKKmCqmielihthfzBSzxGwxR8wV88R8cYBYIA4UB4mF4mBxiDhUHCYC4nARFItEqSgTIVEuKsRiERZHiCWiUlSKKhERUREV1aJaLBUxERcJUSNqxTKxXKwQK8WRYpU4ShwtjhHHiuPE8eIEcaI4SZwsVotTxKniNHG6OEOsEWeKZ+hZ4myxVpwjzhXrxDpxnlgv1ovzxQaxQVwgLhQXiYvExeIScam4VFwmLhcbxUZxhbhSXCWuFleLa8S1YpPYJK4T14vrxQ3iRnGTuFncIm4Vt4nbxR3iTnGXuFvcI+4V94n7xQPiQfGQeFg8Ih4Vm8Vj4nHxhHhSPCWeFs+IZ8Vz4nnxgnhRvCReFq+IV8UW8Zp4Xbwhtoo3xVvibfGOeFe8J94XH4gPxUfiY/GJ+FR8Jj4XX4ht4kvxlfhafCO+Fd+J78X34gfxg/iTrgI/ip/ET2IX/VlsF9vFL+JX8Zv4XewQf4g/xV9ip9gpdondYo8AEkookcSSSCKpZJJLLoWU0pCGVFJLU1oyS+4l28i2sp1sJ9vLDrKj7CQ7yc6yi+wqu8pusrvsIXvKnrKX7C0h6yP7yr6yn+wvB8gBcqAcJLNltsyRg+UQOUQOlcPkcDkKjJC50ifzpF/mywJZKItksSyRI+XecpQcLcfIfeS+cqwcJ8fLCXKi3E9OkpPlFDlVTpPT5Qy5v5wpZ8nZco6cK+fJ+fIAuUAeKA+SC+XB8hB5qDxMBuThMigXyVJZJkOyXFbIxTIsj5BLZKWskhEZldVyqYzJuEzIGlkrl8nlcoVcKY+Uq+RR8mh5jDxWHiePlyfIE+VJ8mS5Wp4iT5WnydPlGXKNPFOeJc+Wa+U58ly5Tp4n18vz5QZ5gbxQXiQvlpfIS+Vl8nK5UV4hr5RXyavlNfJauUleJ6+XN8gb5U3yZnmLvFXeJm+Xd8g75V3ybnmPvFfeJ++XD8gH5UPyYfmIfFRulo/Jx+UT8kn5lHxaPiOflc/J5+UL8kX5knxZDmSvyFflFvmafF2+IbfKN+Vb8m35jnxXvifflx/ID+VH8mP5ifxUfiY/l1/IbfJL+ZX8Wn4jv5Xfye/lD/JH+ZP8WW6Xv8hf5W/yd7lD/iH/lH/JnXKX3C33SGBAAxnYIAY1mMENYUjDMJShDdOwjCxjL6ON0dZoZ7Q3OhgdjU5GZ6OL0dXoZnQ3ehg9jV5Gb6OP0dfoZ/Q3BhgDjUFGtpFjDDaGGEONYcZwY4SRa/iMPMNv5BsFRqFRZBQbJcZIY29jlDHaGGPsY+xrjDXGGeONCcZEYz9jkjHZmGJMNaYZ040Zxv7GTGOWMduYY8w15hnzjQOMBcaBxkHGQuNg4xDjUOMwI2AcbgSNRUapUWaEjHKjwlhshI0jjCVGpVFlRIyoUW0sNWJG3EgYNUatkc+WGcuNFcZK40hjlXGUcbRxjHGscZxxvHGCcaJxknGScbKx2jjFONU4zTjdOMNYY5xpnGWcbaw1zjHONdYZ5xnrjfONDcYFxoXGRcbFxiXGpcZlxuXGRuMK40rjKuNq4xrjWmOTcZ1xvXGDcaNxk3GzcYtxq3Gbcbtxh3GncZdxt3GPca9xn3G/8YDxoPGQ8bDxiPGosdl4zHjceMJ40njKeNp4xnjWeM543njBeNF4yXjZeMV41dhivGa8brxhbDXeNN4y3jbeMd413jPeNz4wPjQ+Mj42PjE+NT4zPje+MLYZXxpfGV8b3xjfGt8Z3xs/GD8aPxk/G9uNX4xfjd+M340dxh/Gn8Zfxk5jl7Hb2GMABRVSWBFFFVNcCSWVoZTSylSWylJ7qTaqrWqn2qsOagzrqDqpzqqL6qq6qe6qh+qpeqneqo/qq/qp/mqAGqgGqWyVowarIWqoGqaGqxEqV/lUnvKrxShfFahCtRsUqSJVrErUSDWZ7a1GqdFqjNpH7avGqnFqvJqgJqr91CQ1WU1RU9VUNc1J09V0NUPtr2aqWWq2mqPmqrlqnpPmq/nqALVAHagOUgvVwepgdYg61EmHqYA6XAVVUC1SpapMhVS5qlCLVVgdoZaoSlWlIiqqqtVSFVMxNY/NY3EVVwlVo2rVMnUgW65WqBVqpTpSrVIHsaPU0U46Rh2rFrLj1PHqBHWiOkmdrFarU9Sp6jR1ujqEnaHWqDXqTCedpc5SZ6u16hx1rlqnzlPnqUPZoWy9Wq/OVxvUBepCdZG6WF2iLlWXqcvVRnWFulJdpa5WAXaNulZtUoez69T16gZ1o7pJ3axuUbeq29Tt6g51p7pL3a3uUfeq+9T96n71gHpAPageUg+rR1SYPaoeVZvVZvWYelxVsifUk+op9bR6Rj2rnlPPqxfUi+ol9bJ6RZ3DXlVb1Bb1mnpdvaG2qjfVW+pt9Y56V72n3lcfKHvl9UP1kfpYfaI+VZ+pz9UXapu6hH2pvlJfq2/Ut+pb9Z36Xv2gflT3gJ/Uz2q7+iWVflW/qd/VDvWH+lP9pXaqnWqX2q32KKChRhproommmmmuhZba0IZWWmtTWzpL76Xb6Da6rW6n2+sOuqPupDvrLvpK0FV30910d91D99S9dC/dW/fRfXU/3U/31wP0QD1ID9LZOkcP1kP0ED1UD9PD9Qg9Qudqn87Tfp2vC3SBLtRFulgX6xI9Uu+tR+lRerQeo/fR++p99Vg9To/XE/QEPVFP1JvYfnqSnqyn6Kl6mp6uZ+j99Uw9S8/Ss/UcPVfP0/P1fH2AXqAP1Afpg/RCfbA+RB+qD9MBfbg+XAf1Il2qy3RIl+tyXaEX67A+Qh+hl+hKfRur0hEd1dV6qY7pmI7rhK7Rt7NavUwv1yv0Sn2kXqWP0kfpo/Ux+hh9rD5OH6eP1yfoE/VJ+iR9sl6tT9Gn6tP06foMvUav0Wfqs/QF5Gy9Vq/V5+hz9Tp9nl6vz9cb9AX6Qn2Rvlhfoi/Vl+nL9UZ9hb5SX6Wv1tfoa/UmfZ2+Xt+gb9Qfspv0zfoWfau+Td+u7T1md+g79V36bn2Pvlffp+/XD+gH9UP6Yf2IflRv1o/px/UT+kn9lH5aP6Of1c/p5/UL+kX9kn5Zv6Jf1Vv0a/p1/Ybeqt/Ub+m39Tv63VR6T7+vP9Af6o/0x/oT/an+TP/Gf+Of6y/0Nv2l/kp/rb/R3+rv9Pf6B/2j/kn/rLfrX/Sv+jf9u96h/9B/6r/0Tr1LP0x26z0amNBEJjaJSU1mclOY0jRMZWrTNC0zy9zLbGO2NduZ7c0OZkezk9nZ7GJ2NbuZ3c0eZk+zl9nb7GP2NfuZ/c0B5kBzkJlt5piDzSHmUHOYOdwcYeaaPjPP9Jv5ZoFZaBaZxWaJOdLc2xxljnY+Y8x9nM++5ljnM84c73wmmBPrP/uZk8zJ5hTnM9Wc5nymmzPM/c2Z5ixztjnHnGvOM+ebB5gLzAPNg8yF5sHmIeah5kR6mBkwDzeD5iKz1CwzQ2a5WWEuNsPmEeYSs9KsMiNm1Kw2l5oxM24mzBqz1lxmLjdXmCvNLehIcytZZdor9MlvTf9v4Hh/S672H2natHUgXYuX9vGoTm4rGYfSf9fpacipQautr06qOSf5rZgW06PMo81jzGPN48zjzRPME8wTzZPMk83V5mrzFPNU8zRzNj/dPMOcw9eYZ5pnmXP52eZa8xzzXHMeX2eeZ643zzc3mBeYF5rz+UXmxeYl5qXmZebl5kbzCvNK8yrzavMa81pzk3mdeb15g3mjOQXdZN5s3mLeat5mLuO3m13RNhIAd5h3mneZd5v3mPea95n3mw+YD5oPmQ+bj5iPmpvNx8zHzSfMJ82nzKfNZ8xnzefM58znzRfMF82XzJfNV8xXzS3ma+br5hvmVvNN8y1zPX/bfMd813zPfN/8wPyLfGh+ZH5sfmJ+an5mfm5+YW4zvzR3kq/Mr81vzG/N78zvzR/MH82fzJ/N7eYv5q/mb+bv5g7zD/NP8y9zp7nL3G3uMYG1EUALWdgiFrWYxS1hCUtahqUsbZmWZWVZe1ltrLZWO6u91cHqaHWyOltf4y5WW9rV6mZ1t3pYj/CeVi+rt9XH6mv1tfpZ/a0B1kBroDXIyrayrRxrsDXEGmoNs4ZbI6xcy2flWX4r3yqwCq0iq9gqsUZae1ujrNHWGGsfa19rrDXOGm9NsCZa+1mTrMnWFGuqNc2abs2w9rdmWrOs2dYca641z5pvHWAtsA60DrIWWgdbh1iHWodZAetwK2gtskqtMitklVsV1mIrbB1hLbEqrSorYkWtamupFbPiVsKqsWqtZdZya4W10jrSWmUdZR1tHWMdax1nHW+dYJ1onWSdbK22TrFOtU6zTrfOsNZYZ1pnWWdba61zrHOtddZ51nrrfGuDdYF1oXWRdbF1iXWpdZl1ubXRusK60rrKutq6xrrW2mRdZ11v3WDdaN1k3WzdYt1q3Wbdbt1h3WndZd1t3WPda91n3W89YD1oPWQ9bD1iPWptth6zHreesJ60nrKetp6xnrWes563XrBetF6yXrZesV61tlivWa9bb1hbrTett6y3rXesd633rPetD6wPrY+sj61PrE+tz6zPrS+sbdaX1lfW19Y31rfWd9b31g/Wj9ZP1s/WdusX61frN+t3a4f1h/Wn9Ze109pl7bb2WCALZqEsnEWyaBbL4lkiS2YZWSpLZ5lZVlZW1l5ZbbLaZrXLap/VIatj1p4W/3XK6pTVOatL1n8BzFWOn70/AgA=",
  "compat": "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"
};

// src/debug.ts
var cache = /* @__PURE__ */ new Map();
function loadMap(buildKey) {
  return __async(this, null, function* () {
    if (cache.has(buildKey)) return cache.get(buildKey);
    const b64 = WASM_SOURCE_MAP[buildKey];
    if (!b64) throw new Error(`No source map for build "${buildKey}"`);
    const gzipped = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const ds = new DecompressionStream("gzip");
    const writer = ds.writable.getWriter();
    writer.write(gzipped);
    writer.close();
    const buf = yield new Response(ds.readable).arrayBuffer();
    const dv = new DataView(buf);
    const bytes = new Uint8Array(buf);
    const firstId = dv.getUint32(0, true);
    const funcCount = dv.getUint32(4, true);
    const numNames = dv.getUint32(8, true);
    const td = new TextDecoder();
    const names = [];
    let pos = 12;
    for (let i = 0; i < numNames; i++) {
      const len = bytes[pos++];
      names.push(td.decode(bytes.subarray(pos, pos + len)));
      pos += len;
    }
    const funcNames = [];
    for (let i = 0; i < funcCount; i++) {
      const idx = dv.getUint16(pos, true);
      pos += 2;
      funcNames.push(idx === 65535 ? null : names[idx]);
    }
    const entry = { firstId, funcNames };
    cache.set(buildKey, entry);
    return entry;
  });
}
var Debug = {
  /**
   * Resolves a list of wasm function indices to their cleaned symbol names.
   */
  decodeFuncIds: (funcIds, isCompatBuild) => __async(void 0, null, function* () {
    const buildKey = isCompatBuild ? "compat" : "default";
    const { firstId, funcNames } = yield loadMap(buildKey);
    return funcIds.map((funcId) => {
      const i = funcId - firstId;
      const name = i >= 0 && i < funcNames.length && funcNames[i] ? funcNames[i] : "(unknown)";
      return { funcId, name };
    });
  }),
  /**
   * Annotates a wasm stack trace string with resolved function names.
   *
   * Example input from Chrome:
   *   at http://localhost:8080/esm/wasm/wllama.wasm:wasm-function[775]:0x74251
   *   at async blob:http://localhost:8080/53a863cc-7227-45cc-8594-ddbbf5257f20:317:28
   *
   * Example input from Firefox:
   *   @http://localhost:8080/esm/wasm/wllama.wasm:wasm-function[796]:0x7dfe2
   *       at wModuleInit/WebAssembly.promising/< (9b6a2acd-d909-44e2-b021-d42fb9087cfb:15:32) index.js:1433:45
   *
   * Example input from Safari:
   *   2441@wasm-function[2441]
   *       at wrapper (d746f19e-4523-4f36-ba06-d0969acc0b05:22:126009)
   *
   * Example output:
   *   wasm-func[775] (server_response::send)
   */
  decodeStackTrace: (stack, isCompatBuild) => __async(void 0, null, function* () {
    const re = /wasm-function\[(\d+)\]/g;
    const funcIds = [
      ...new Set([...stack.matchAll(re)].map((m) => parseInt(m[1])))
    ];
    if (funcIds.length === 0) return stack;
    const resolved = yield Debug.decodeFuncIds(funcIds, isCompatBuild);
    return resolved.map((r) => {
      if (r.name === "(unknown)") {
        return `    wasm-func[${r.funcId}] (unknown)`;
      }
      return `    wasm-func[${r.funcId}] (${r.name})`;
    }).join("\n");
  })
};

// src/utils.ts
var textDecoder = new TextDecoder();
var URL_PARTS_REGEX = /-(\d{5})-of-(\d{5})\.gguf(?:\?.*)?$/;
var parseShardNumber = (fnameOrUrl) => {
  const matches = fnameOrUrl.match(URL_PARTS_REGEX);
  if (!matches) {
    return {
      baseURL: fnameOrUrl,
      current: 1,
      total: 1
    };
  } else {
    return {
      baseURL: fnameOrUrl.replace(URL_PARTS_REGEX, ""),
      current: parseInt(matches[1]),
      total: parseInt(matches[2])
    };
  }
};
var sortFileByShard = (blobs) => {
  const isFiles = blobs.every((b) => !!b.name);
  if (isFiles && blobs.length > 1) {
    const files = blobs;
    files.sort((a, b) => {
      const infoA = parseShardNumber(a.name);
      const infoB = parseShardNumber(b.name);
      return infoA.current - infoB.current;
    });
  }
};
var isMmproj = (blob) => __async(void 0, null, function* () {
  const META_NAME = "general.architecture";
  const META_VAL = "clip";
  const tmp = blob.slice(0, 128 * 1024);
  const header = yield tmp.arrayBuffer();
  const buf = new Uint8Array(header);
  const nameBytes = new TextEncoder().encode(META_NAME);
  const valBytes = new TextEncoder().encode(META_VAL);
  let offset = -1;
  outer: for (let i = 0; i <= buf.length - nameBytes.length; i++) {
    for (let j = 0; j < nameBytes.length; j++) {
      if (buf[i + j] !== nameBytes[j]) continue outer;
    }
    offset = i;
    break;
  }
  if (offset === -1) return false;
  if (offset + 8 * 4 + 4 > buf.length) return false;
  const view = new DataView(header);
  const valLen = view.getBigUint64(offset + 8 * 3, true);
  if (valLen !== /* @__PURE__ */ BigInt("4")) return false;
  for (let i = 0; i < valBytes.length; i++) {
    if (buf[offset + 8 * 4 + i] !== valBytes[i]) return false;
  }
  return true;
});
var absoluteUrl = (relativePath) => typeof document === "undefined" ? new URL(relativePath, self.location.href).href : new URL(relativePath, document.baseURI).href;
var padDigits = (number, digits) => {
  return Array(Math.max(digits - String(number).length + 1, 0)).join("0") + number;
};
var sumArr = (arr) => arr.reduce((prev, curr) => prev + curr, 0);
var isString = (value) => !!(value == null ? void 0 : value.startsWith);
var MMPROJ_FILE_NAME = "mmproj.gguf";
var prepareBlobs = (blobsInp) => __async(void 0, null, function* () {
  const blobs = [];
  let blobMmproj = null;
  for (const blob of blobsInp) {
    if (yield isMmproj(blob)) {
      blobMmproj = blob;
    } else {
      blobs.push(blob);
    }
  }
  sortFileByShard(blobs);
  const result = blobs.map((blob, i) => ({
    blob,
    name: `model-${padDigits(i + 1, 5)}-of-${padDigits(blobs.length, 5)}.gguf`
  }));
  if (blobMmproj) {
    result.push({
      blob: blobMmproj,
      name: MMPROJ_FILE_NAME
    });
  }
  return {
    llm: result.filter((f) => f.name !== MMPROJ_FILE_NAME),
    mmproj: blobMmproj ? { blob: blobMmproj, name: MMPROJ_FILE_NAME } : null,
    all: result
  };
});
var isSupportMultiThread = () => ((e) => __async(void 0, null, function* () {
  try {
    return "undefined" != typeof MessageChannel && new MessageChannel().port1.postMessage(new SharedArrayBuffer(1)), WebAssembly.validate(e);
  } catch (e2) {
    return false;
  }
}))(
  new Uint8Array([
    0,
    97,
    115,
    109,
    1,
    0,
    0,
    0,
    1,
    4,
    1,
    96,
    0,
    0,
    3,
    2,
    1,
    0,
    5,
    4,
    1,
    3,
    1,
    1,
    10,
    11,
    1,
    9,
    0,
    65,
    0,
    254,
    16,
    2,
    0,
    26,
    11
  ])
);
var isSupportExceptions = () => __async(void 0, null, function* () {
  return WebAssembly.validate(
    new Uint8Array([
      0,
      97,
      115,
      109,
      1,
      0,
      0,
      0,
      1,
      4,
      1,
      96,
      0,
      0,
      3,
      2,
      1,
      0,
      10,
      8,
      1,
      6,
      0,
      6,
      64,
      25,
      11,
      11
    ])
  );
});
var isSupportSIMD = () => __async(void 0, null, function* () {
  return WebAssembly.validate(
    new Uint8Array([
      0,
      97,
      115,
      109,
      1,
      0,
      0,
      0,
      1,
      5,
      1,
      96,
      0,
      1,
      123,
      3,
      2,
      1,
      0,
      10,
      10,
      1,
      8,
      0,
      65,
      0,
      253,
      15,
      253,
      98,
      11
    ])
  );
});
var isSupportJSPI = () => {
  return !!WebAssembly.Suspending;
};
var isSupportWebGPU = () => {
  return !!navigator.gpu;
};
var isSupportMem64 = () => {
  try {
    new WebAssembly.Memory({
      address: "i64",
      initial: /* @__PURE__ */ BigInt("1")
      // 1 page (64 KiB)
    });
    return true;
  } catch (e) {
    return false;
  }
};
var checkEnvironmentCompatible = () => __async(void 0, null, function* () {
  if (!(yield isSupportExceptions())) {
    throw new Error("WebAssembly runtime does not support exception handling");
  }
  if (!(yield isSupportSIMD())) {
    throw new Error("WebAssembly runtime does not support SIMD");
  }
});
var isFirefox = () => {
  return !!navigator.userAgent.match(/Firefox\/([0-9\.]+)(?:\s|$)/);
};
var GGUF_FILE_REGEX = /^.*\.gguf(?:\?.*)?$/;
var isValidGgufFile = (path) => {
  return GGUF_FILE_REGEX.test(path);
};
var isSafariMobile = () => {
  return !!navigator.userAgent.match(/Version\/([0-9\._]+).*Mobile.*Safari.*/);
};
var createWorker = (workerCode) => {
  const workerURL = URL.createObjectURL(
    isString(workerCode) ? new Blob([workerCode], { type: "text/javascript" }) : workerCode
  );
  return new Worker(workerURL, { type: "module" });
};
var cbToAsyncIter = (fn) => (...args) => {
  let values = [];
  let resolve;
  let reject;
  values.push(
    new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    })
  );
  fn(...args, (val, done, err) => {
    if (err) {
      reject(err);
      return;
    }
    resolve([val, done]);
    values.push(
      new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      })
    );
  });
  return function() {
    return __asyncGenerator(this, null, function* () {
      let val;
      for (let i = 0, done = false; !done; i++) {
        [val, done] = yield new __await(values[i]);
        delete values[i];
        if (val !== void 0) yield val;
      }
    });
  }();
};
var canUseAsyncFileRead = (compat) => isSupportJSPI() || compat;
var needCompat = () => !isSupportJSPI() || !isSupportMem64();

// src/workers-code/generated.ts
var LIBLLAMA_VERSION = "b10591-8144f31";
var LLAMA_CPP_WORKER_CODE = "// Start the main llama.cpp\nlet wllamaMalloc;\nlet wllamaStart;\nlet wllamaAction;\nlet wllamaExit;\nlet wllamaDebug;\n\nlet Module = null;\nlet isCompat = false;\nlet lastStack = '';\nlet isAborted = false;\nlet hasMultithread = false;\n\n//////////////////////////////////////////////////////////////\n// UTILS\n//////////////////////////////////////////////////////////////\n\n// send message back to main thread\nconst msg = (data, transfer) => postMessage(data, transfer);\n\n// Convert CPP log into JS log\nconst cppLogToJSLog = (line) => {\n  const matched = line.match(/@@(DEBUG|INFO|WARN|ERROR)@@(.*)/);\n  return !!matched\n    ? {\n        level: (matched[1] === 'INFO' ? 'debug' : matched[1]).toLowerCase(),\n        text: matched[2],\n      }\n    : { level: 'log', text: line };\n};\n\nconst getHeapU8 = () => {\n  const buffer = Module.wasmMemory.buffer;\n  return new Uint8Array(buffer);\n};\n\nconst toSizeT = (num) => {\n  return isCompat ? Number(num) : BigInt(num);\n};\n\n// Get module config that forwards stdout/err to main thread\nconst getWModuleConfig = (_argMainScriptBlob) => {\n  var pathConfig = RUN_OPTIONS.pathConfig;\n  var pthreadPoolSize = RUN_OPTIONS.nbThread;\n  var argMainScriptBlob = _argMainScriptBlob;\n\n  isCompat = RUN_OPTIONS.compat;\n  hasMultithread = pthreadPoolSize > 1;\n\n  msg({\n    verb: 'console.debug',\n    args: [\n      `Multithread enabled: ${hasMultithread}, pthreadPoolSize: ${pthreadPoolSize}`,\n    ],\n  });\n\n  if (!pathConfig['wllama.wasm']) {\n    throw new Error('\"wllama.wasm\" is missing in pathConfig');\n  }\n  return {\n    noInitialRun: true,\n    print: function (text) {\n      if (arguments.length > 1)\n        text = Array.prototype.slice.call(arguments).join(' ');\n      msg({ verb: 'console.log', args: [text] });\n    },\n    printErr: function (text) {\n      if (arguments.length > 1)\n        text = Array.prototype.slice.call(arguments).join(' ');\n      if (text.startsWith('@@STACK@@')) {\n        lastStack = text.slice('@@STACK@@'.length);\n        return;\n      }\n      const logLine = cppLogToJSLog(text);\n      msg({ verb: 'console.' + logLine.level, args: [logLine.text] });\n    },\n    locateFile: function (filename, basePath) {\n      const p = pathConfig[filename];\n      const truncate = (str) =>\n        str.length > 128 ? `${str.substr(0, 128)}...` : str;\n      if (filename.match(/wllama\\.worker\\.js/)) {\n        msg({\n          verb: 'console.error',\n          args: [\n            '\"wllama.worker.js\" is removed from v2.2.1. Hint: make sure to clear browser\\'s cache.',\n          ],\n        });\n      } else {\n        msg({\n          verb: 'console.debug',\n          args: [`Loading \"${filename}\" from \"${truncate(p)}\"`],\n        });\n        return p;\n      }\n    },\n    mainScriptUrlOrBlob: hasMultithread\n      ? argMainScriptBlob\n      : 'throw new Error(\"Multithreading is not enabled\")',\n    pthreadPoolSize: hasMultithread ? pthreadPoolSize : 0,\n    wasmMemory: hasMultithread ? getWasmMemory() : null,\n    onAbort: function (message) {\n      isAborted = true;\n      msg({ verb: 'signal.abort', args: ['abort', message, lastStack, null] });\n    },\n    onExit: function (code) {\n      isAborted = true;\n      const callstack = new Error().stack.toString();\n      msg({\n        verb: 'signal.abort',\n        args: ['abort', 'exit(' + code + ')', callstack, null],\n      });\n    },\n  };\n};\n\n// Get the memory to be used by wasm. (Only used in multi-thread mode)\n// Because we have a weird OOM issue on iOS, we need to try some values\n// See: https://github.com/emscripten-core/emscripten/issues/19144\n//      https://github.com/godotengine/godot/issues/70621\nconst getWasmMemory = () => {\n  let minBytes = 128 * 1024 * 1024;\n  let maxBytes = 4096 * 1024 * 1024;\n  let stepBytes = 128 * 1024 * 1024;\n  while (maxBytes > minBytes) {\n    try {\n      const wasmMemory = new WebAssembly.Memory({\n        initial: toSizeT(minBytes / 65536),\n        maximum: toSizeT(maxBytes / 65536),\n        shared: true,\n        address: isCompat ? undefined : 'i64',\n      });\n      return wasmMemory;\n    } catch (e) {\n      maxBytes -= stepBytes;\n      continue; // retry\n    }\n  }\n  throw new Error('Cannot allocate WebAssembly.Memory');\n};\n\n//////////////////////////////////////////////////////////////\n// HEAPFS PATCH\n//////////////////////////////////////////////////////////////\n\n/**\n * By default, emscripten uses memfs. The way it works is by\n * allocating new Uint8Array in javascript heap. This is not good\n * because it requires files to be copied to wasm heap each time\n * a file is read.\n *\n * HeapFS is an alternative, which resolves this problem by\n * allocating space for file directly inside wasm heap. This\n * allows us to mmap without doing any copy.\n *\n * For llama.cpp, this is great because we use MAP_SHARED\n *\n * Ref: https://github.com/ngxson/wllama/pull/39\n * Ref: https://github.com/emscripten-core/emscripten/blob/main/src/library_memfs.js\n *\n * Note 29/05/2024 @ngxson\n * Due to ftell() being limited to MAX_LONG, we cannot load files bigger than 2^31 bytes (or 2GB)\n * Ref: https://github.com/emscripten-core/emscripten/blob/main/system/lib/libc/musl/src/stdio/ftell.c\n */\n\nconst fsNameToFile = {}; // map Name => File\nconst fsIdToFile = {}; // map ID => File\nlet currFileId = 0;\n\n// Patch and redirect memfs calls to wllama\nconst patchHeapFS = () => {\n  const m = Module;\n  // save functions\n  m.MEMFS.stream_ops._read = m.MEMFS.stream_ops.read;\n  m.MEMFS.stream_ops._write = m.MEMFS.stream_ops.write;\n  m.MEMFS.stream_ops._llseek = m.MEMFS.stream_ops.llseek;\n  m.MEMFS.stream_ops._allocate = m.MEMFS.stream_ops.allocate;\n  m.MEMFS.stream_ops._mmap = m.MEMFS.stream_ops.mmap;\n  m.MEMFS.stream_ops._msync = m.MEMFS.stream_ops.msync;\n\n  const patchStream = (stream) => {\n    const name = stream.node.name;\n    if (fsNameToFile[name]) {\n      const f = fsNameToFile[name];\n      const ptr = Number(f.ptr);\n      stream.node.contents = getHeapU8().subarray(ptr, ptr + f.size);\n      stream.node.usedBytes = f.size;\n    }\n  };\n\n  // replace \"read\" functions\n  m.MEMFS.stream_ops.read = function (\n    stream,\n    buffer,\n    offset,\n    length,\n    position\n  ) {\n    patchStream(stream);\n    return m.MEMFS.stream_ops._read(stream, buffer, offset, length, position);\n  };\n  m.MEMFS.ops_table.file.stream.read = m.MEMFS.stream_ops.read;\n\n  // replace \"llseek\" functions\n  m.MEMFS.stream_ops.llseek = function (stream, offset, whence) {\n    patchStream(stream);\n    return m.MEMFS.stream_ops._llseek(stream, offset, whence);\n  };\n  m.MEMFS.ops_table.file.stream.llseek = m.MEMFS.stream_ops.llseek;\n\n  // replace \"mmap\" functions\n  m.MEMFS.stream_ops.mmap = function (stream, length, position, prot, flags) {\n    patchStream(stream);\n    const name = stream.node.name;\n    if (fsNameToFile[name]) {\n      const f = fsNameToFile[name];\n      const mmapPtr = f.ptr + toSizeT(position);\n      return {\n        ptr: mmapPtr,\n        allocated: false,\n      };\n    } else {\n      return m.MEMFS.stream_ops._mmap(stream, length, position, prot, flags);\n    }\n  };\n  m.MEMFS.ops_table.file.stream.mmap = m.MEMFS.stream_ops.mmap;\n\n  // mount FS\n  m.FS.mkdir('/models');\n  m.FS.mount(m.MEMFS, { root: '.' }, '/models');\n};\n\n// Allocate a new file in wllama heapfs, returns file ID\nconst heapfsAlloc = (name, size, allocBuffer) => {\n  if (size < 1) {\n    throw new Error('File size must be bigger than 0');\n  }\n  const m = Module;\n  const ptr = toSizeT(allocBuffer ? m.mmapAlloc(size) : 0);\n  const file = {\n    ptr: ptr,\n    size: size,\n    id: currFileId++,\n  };\n  fsIdToFile[file.id] = file;\n  fsNameToFile[name] = file;\n  return file.id;\n};\n\n// Add new file to wllama heapfs, return number of written bytes\nconst heapfsWrite = (id, buffer, offset) => {\n  if (fsIdToFile[id]) {\n    const { ptr, size } = fsIdToFile[id];\n    const afterWriteByte = offset + buffer.byteLength;\n    if (afterWriteByte > size) {\n      throw new Error(\n        `File ID ${id} write out of bound, afterWriteByte = ${afterWriteByte} while size = ${size}`\n      );\n    }\n    getHeapU8().set(buffer, Number(ptr) + offset);\n    return buffer.byteLength;\n  } else {\n    throw new Error(`File ID ${id} not found in heapfs`);\n  }\n};\n\n//////////////////////////////////////////////////////////////\n// ASYNC FILE READ\n//////////////////////////////////////////////////////////////\n\nlet isAwaitReading = false;\nlet pendingReadPromise = null;\nlet pendingReadResolve = null;\nlet pendingReadReject = null;\n\nconst _stripModelsPrefix = (path) => path.replace(/^\\/?models\\//, '');\n\n// Called from EM_ASYNC_JS stub in wllama-fs.h (path is already a JS string)\nconst _wllama_js_file_read = async (path, offset, req_size, out_ptr) => {\n  const name = _stripModelsPrefix(path);\n\n  pendingReadPromise = new Promise((res, rej) => {\n    pendingReadResolve = res;\n    pendingReadReject = rej;\n  });\n  isAwaitReading = true;\n\n  postMessage({ verb: 'fs.read_req', args: [name, offset, req_size] });\n\n  let data;\n  try {\n    data = await pendingReadPromise;\n  } finally {\n    isAwaitReading = false;\n    pendingReadResolve = null;\n    pendingReadReject = null;\n  }\n\n  const bytes = new Uint8Array(data);\n  getHeapU8().set(bytes, out_ptr);\n  return toSizeT(bytes.length);\n};\n\n//////////////////////////////////////////////////////////////\n// MAIN CODE\n//////////////////////////////////////////////////////////////\n\nconst callWrapper = (name, ret, args, isAsync) => {\n  const fn = Module.cwrap(\n    name,\n    ret,\n    args,\n    isAsync ? { async: true } : undefined\n  );\n  return async (action, req) => {\n    // console.log(`Calling ${name} with action:`, action, 'and req:', req);\n    let result;\n    try {\n      if (args.length === 2) {\n        result = isAsync ? await fn(action, req) : fn(action, req);\n      } else {\n        result = fn();\n      }\n    } catch (ex) {\n      console.error(ex);\n      throw ex;\n    }\n    return result;\n  };\n};\n\n// re-entering the wasm while a call is suspended (JSPI / asyncify) corrupts its state, so only one call runs at a time and the rest wait in the queue\nlet wasmCallBusy = false;\nconst wasmCallQueue = [];\n\nconst runWasmCall = async (callbackId, fn) => {\n  if (isAborted) {\n    // the wasm is dead, fail fast instead of calling into it\n    msg({ callbackId, err: 'wllama has crashed, please reload the module' });\n    return;\n  }\n  if (wasmCallBusy) {\n    wasmCallQueue.push({ callbackId, fn });\n    return;\n  }\n  wasmCallBusy = true;\n  try {\n    await fn();\n  } finally {\n    wasmCallBusy = false;\n    if (isAborted) {\n      // do not touch the wasm again after it aborted; the main thread already rejected the queued tasks\n      wasmCallQueue.length = 0;\n    } else {\n      const next = wasmCallQueue.shift();\n      if (next) runWasmCall(next.callbackId, next.fn);\n    }\n  }\n};\n\nconst runAction = async (data) => {\n  const { args, callbackId } = data;\n  const argAction = args[0];\n  const argEncodedMsg = args[1];\n  try {\n    const inputPtr = await wllamaMalloc(toSizeT(argEncodedMsg.byteLength), 0);\n    // copy data to wasm heap\n    const inputBuffer = new Uint8Array(\n      getHeapU8().buffer,\n      Number(inputPtr),\n      argEncodedMsg.byteLength\n    );\n    inputBuffer.set(argEncodedMsg, 0);\n    const outputPtr = await wllamaAction(argAction, inputPtr);\n    // length of output buffer is written at the first 4 bytes of input buffer\n    const outputLen = new Uint32Array(\n      getHeapU8().buffer,\n      Number(inputPtr),\n      1\n    )[0];\n    // copy the output buffer to JS heap\n    const outputBuffer = new Uint8Array(outputLen);\n    const outputSrcView = new Uint8Array(\n      getHeapU8().buffer,\n      Number(outputPtr),\n      outputLen\n    );\n    outputBuffer.set(outputSrcView, 0); // copy it\n    msg({ callbackId, result: outputBuffer }, [outputBuffer.buffer]);\n  } catch (err) {\n    handleError(err);\n  }\n};\n\nfunction handleError(err) {\n  // If WASM already aborted, onAbort already sent signal.abort; skip to avoid\n  // re-reporting the resulting WebAssembly.RuntimeError as a JS exception.\n  if (isAborted) return;\n\n  const message = err ? err.message || String(err) : 'Unknown error';\n  const stack = err ? err.stack || String(err) : '';\n  msg({\n    verb: 'signal.abort',\n    args: ['exception', message, stack, err],\n  });\n}\n\nonmessage = async (e) => {\n  if (!e.data) return;\n  const { verb, args, callbackId } = e.data;\n\n  // fs.read_res arrives while wasm is JSPI-suspended; resolve the pending promise.\n  if (verb === 'fs.read_res') {\n    if (pendingReadResolve) {\n      pendingReadResolve(args[0]);\n    }\n    return;\n  }\n\n  // Guard: while awaiting a file read, reject any other incoming task.\n  if (isAwaitReading) {\n    if (callbackId) {\n      msg({\n        callbackId,\n        err: 'Worker is suspended waiting for file data (JSPI)',\n      });\n    }\n    return;\n  }\n\n  if (!callbackId) {\n    msg({ verb: 'console.error', args: ['callbackId is required', e.data] });\n    return;\n  }\n\n  if (verb === 'module.init') {\n    const argMainScriptBlob = args[0];\n    const argUseAsyncFile = args[1];\n    try {\n      Module = getWModuleConfig(argMainScriptBlob);\n      Module.preRun = () => {\n        if (argUseAsyncFile) {\n          Module.ENV['USE_ASYNC_FILE'] = '1';\n        }\n      };\n      Module.onRuntimeInitialized = () => {\n        // async call once module is ready\n        // init FS\n        patchHeapFS();\n        // init cwrap\n        const pointer = isCompat ? 'number' : 'bigint';\n        // TODO: note sure why emscripten cannot bind if there is only 1 argument\n        wllamaMalloc = callWrapper('wllama_malloc', pointer, [\n          'number',\n          pointer,\n        ]);\n        wllamaStart = callWrapper('wllama_start', 'string', [], true);\n        wllamaAction = callWrapper(\n          'wllama_action',\n          pointer,\n          ['string', pointer],\n          true\n        );\n        wllamaExit = callWrapper('wllama_exit', 'string', []);\n        wllamaDebug = callWrapper('wllama_debug', 'string', []);\n        msg({ callbackId, result: null });\n      };\n      wModuleInit();\n    } catch (err) {\n      handleError(err);\n    }\n    return;\n  }\n\n  if (verb === 'fs.alloc') {\n    const argFilename = args[0];\n    const argSize = args[1];\n    const argAllocBuffer = args[2];\n    try {\n      // create blank file\n      const emptyBuffer = new ArrayBuffer(0);\n      Module['FS_createDataFile'](\n        '/models',\n        argFilename,\n        emptyBuffer,\n        true,\n        true,\n        true\n      );\n      // alloc data on heap\n      const fileId = heapfsAlloc(argFilename, argSize, argAllocBuffer);\n      msg({ callbackId, result: { fileId } });\n    } catch (err) {\n      handleError(err);\n    }\n    return;\n  }\n\n  if (verb === 'fs.write') {\n    const argFileId = args[0];\n    const argBuffer = args[1];\n    const argOffset = args[2];\n    try {\n      const writtenBytes = heapfsWrite(argFileId, argBuffer, argOffset);\n      msg({ callbackId, result: { writtenBytes } });\n    } catch (err) {\n      handleError(err);\n    }\n    return;\n  }\n\n  if (verb === 'wllama.start') {\n    await runWasmCall(callbackId, async () => {\n      try {\n        const result = await wllamaStart();\n        msg({ callbackId, result });\n      } catch (err) {\n        handleError(err);\n      }\n    });\n    return;\n  }\n\n  if (verb === 'wllama.action') {\n    await runWasmCall(callbackId, () => runAction(e.data));\n    return;\n  }\n\n  if (verb === 'wllama.exit') {\n    await runWasmCall(callbackId, async () => {\n      try {\n        const result = await wllamaExit();\n        msg({ callbackId, result });\n      } catch (err) {\n        handleError(err);\n      }\n    });\n    return;\n  }\n\n  if (verb === 'wllama.debug') {\n    await runWasmCall(callbackId, async () => {\n      try {\n        const result = await wllamaDebug();\n        msg({ callbackId, result });\n      } catch (err) {\n        handleError(err);\n      }\n    });\n    return;\n  }\n};\n";
var OPFS_UTILS_WORKER_CODE = "let accessHandle;\nlet abortController = new AbortController();\n\nasync function openFile(filename) {\n  const opfsRoot = await navigator.storage.getDirectory();\n  const cacheDir = await opfsRoot.getDirectoryHandle('cache', { create: true });\n  const fileHandler = await cacheDir.getFileHandle(filename, { create: true });\n  accessHandle = await fileHandler.createSyncAccessHandle();\n  accessHandle.truncate(0); // clear file content\n}\n\nasync function writeFile(buf) {\n  accessHandle.write(buf);\n}\n\nasync function closeFile() {\n  accessHandle.flush();\n  accessHandle.close();\n}\n\nasync function writeTextFile(filename, str) {\n  await openFile(filename);\n  await writeFile(new TextEncoder().encode(str));\n  await closeFile();\n}\n\nconst throttled = (func, delay) => {\n  let lastRun = 0;\n  return (...args) => {\n    const now = Date.now();\n    if (now - lastRun > delay) {\n      lastRun = now;\n      func.apply(null, args);\n    }\n  };\n};\n\nconst assertNonNull = (val) => {\n  if (val === null || val === undefined) {\n    throw new Error('OPFS Worker: Assertion failed');\n  }\n};\n\n// respond to main thread\nconst resOK = () => postMessage({ ok: true });\nconst resProgress = (loaded, total) =>\n  postMessage({ progress: { loaded, total } });\nconst resErr = (err) => postMessage({ err });\n\nonmessage = async (e) => {\n  try {\n    if (!e.data) return;\n\n    /**\n     * @param {Object} e.data\n     *\n     * Fine-control FS actions:\n     * - { action: 'open', filename: 'string' }\n     * - { action: 'write', buf: ArrayBuffer }\n     * - { action: 'close' }\n     *\n     * Simple write API:\n     * - { action: 'write-simple', filename: 'string', buf: ArrayBuffer }\n     *\n     * Download API:\n     * - { action: 'download', url: 'string', filename: 'string', options: Object, metadataFileName: 'string' }\n     * - { action: 'download-abort' }\n     */\n    const {\n      action,\n      filename,\n      buf,\n      url,\n      options,\n      metadataFileName,\n      metadataAdditional,\n    } = e.data;\n\n    if (action === 'open') {\n      assertNonNull(filename);\n      await openFile(filename);\n      return resOK();\n    } else if (action === 'write') {\n      assertNonNull(buf);\n      await writeFile(buf);\n      return resOK();\n    } else if (action === 'close') {\n      await closeFile();\n      return resOK();\n    } else if (action === 'write-simple') {\n      assertNonNull(filename);\n      assertNonNull(buf);\n      await openFile(filename);\n      await writeFile(buf);\n      await closeFile();\n      return resOK();\n    } else if (action === 'download') {\n      assertNonNull(url);\n      assertNonNull(filename);\n      assertNonNull(metadataFileName);\n      assertNonNull(options);\n      assertNonNull(options.aborted);\n      abortController = new AbortController();\n      if (options.aborted) abortController.abort();\n      const response = await fetch(url, {\n        ...options,\n        signal: abortController.signal,\n      });\n      const contentLength = response.headers.get('content-length');\n      const etag = (response.headers.get('etag') || '').replace(\n        /[^A-Za-z0-9]/g,\n        ''\n      );\n      const total = parseInt(contentLength, 10);\n      const reader = response.body.getReader();\n      await openFile(filename);\n      let loaded = 0;\n      const throttledProgress = throttled(resProgress, 100);\n      while (true) {\n        const { done, value } = await reader.read();\n        if (done) break;\n        loaded += value.byteLength;\n        await writeFile(value);\n        throttledProgress(loaded, total);\n      }\n      resProgress(total, total); // 100% done\n      await closeFile();\n      // make sure this is in-sync with CacheEntryMetadata\n      await writeTextFile(\n        metadataFileName,\n        JSON.stringify({\n          originalURL: url,\n          originalSize: total,\n          etag,\n          ...metadataAdditional,\n        })\n      );\n      return resOK();\n    } else if (action === 'download-abort') {\n      if (abortController) {\n        abortController.abort();\n      }\n      return;\n    }\n\n    throw new Error('OPFS Worker: Invalid action', e.data);\n  } catch (err) {\n    return resErr(err);\n  }\n};\n";
var WLLAMA_EMSCRIPTEN_CODE = 'var Module=typeof Module!="undefined"?Module:{};var ENVIRONMENT_IS_WEB=!!globalThis.window;var ENVIRONMENT_IS_WORKER=!!globalThis.WorkerGlobalScope;var ENVIRONMENT_IS_NODE=globalThis.process?.versions?.node&&globalThis.process?.type!="renderer";var ENVIRONMENT_IS_PTHREAD=ENVIRONMENT_IS_WORKER&&self.name?.startsWith("em-pthread");if(ENVIRONMENT_IS_NODE){var worker_threads=require("worker_threads");global.Worker=worker_threads.Worker;ENVIRONMENT_IS_WORKER=!worker_threads.isMainThread;ENVIRONMENT_IS_PTHREAD=ENVIRONMENT_IS_WORKER&&worker_threads["workerData"]=="em-pthread"}var arguments_=[];var thisProgram="./this.program";var quit_=(status,toThrow)=>{throw toThrow};var _scriptName=globalThis.document?.currentScript?.src;if(typeof __filename!="undefined"){_scriptName=__filename}else if(ENVIRONMENT_IS_WORKER){_scriptName=self.location.href}var scriptDirectory="";function locateFile(path){if(Module["locateFile"]){return Module["locateFile"](path,scriptDirectory)}return scriptDirectory+path}var readAsync,readBinary;if(ENVIRONMENT_IS_NODE){var fs=require("fs");scriptDirectory=__dirname+"/";readBinary=filename=>{filename=isFileURI(filename)?new URL(filename):filename;var ret=fs.readFileSync(filename);return ret};readAsync=async(filename,binary=true)=>{filename=isFileURI(filename)?new URL(filename):filename;var ret=fs.readFileSync(filename,binary?undefined:"utf8");return ret};if(process.argv.length>1){thisProgram=process.argv[1].replace(/\\\\/g,"/")}arguments_=process.argv.slice(2);if(typeof module!="undefined"){module["exports"]=Module}quit_=(status,toThrow)=>{process.exitCode=status;throw toThrow}}else if(ENVIRONMENT_IS_WEB||ENVIRONMENT_IS_WORKER){try{scriptDirectory=new URL(".",_scriptName).href}catch{}if(!ENVIRONMENT_IS_NODE){if(ENVIRONMENT_IS_WORKER){readBinary=url=>{var xhr=new XMLHttpRequest;xhr.open("GET",url,false);xhr.responseType="arraybuffer";xhr.send(null);return new Uint8Array(xhr.response)}}readAsync=async url=>{if(isFileURI(url)){return new Promise((resolve,reject)=>{var xhr=new XMLHttpRequest;xhr.open("GET",url,true);xhr.responseType="arraybuffer";xhr.onload=()=>{if(xhr.status==200||xhr.status==0&&xhr.response){resolve(xhr.response);return}reject(xhr.status)};xhr.onerror=reject;xhr.send(null)})}var response=await fetch(url,{credentials:"same-origin"});if(response.ok){return response.arrayBuffer()}throw new Error(response.status+" : "+response.url)}}}else{}var defaultPrint=console.log.bind(console);var defaultPrintErr=console.error.bind(console);if(ENVIRONMENT_IS_NODE){var utils=require("util");var stringify=a=>typeof a=="object"?utils.inspect(a):a;defaultPrint=(...args)=>fs.writeSync(1,args.map(stringify).join(" ")+"\\n");defaultPrintErr=(...args)=>fs.writeSync(2,args.map(stringify).join(" ")+"\\n")}var out=defaultPrint;var err=defaultPrintErr;var wasmBinary;var wasmModule;var ABORT=false;var EXITSTATUS;function assert(condition,text){if(!condition){abort(text)}}var isFileURI=filename=>filename.startsWith("file://");function growMemViews(){if(wasmMemory.buffer!=HEAP8.buffer){updateMemoryViews()}}if(ENVIRONMENT_IS_NODE&&ENVIRONMENT_IS_PTHREAD){var parentPort=worker_threads["parentPort"];parentPort.on("message",msg=>global.onmessage?.({data:msg}));Object.assign(globalThis,{self:global,postMessage:msg=>parentPort["postMessage"](msg)});process.on("uncaughtException",err=>{postMessage({cmd:"uncaughtException",error:err});process.exit(1)})}var startWorker;if(ENVIRONMENT_IS_PTHREAD){var initializedJS=false;self.onunhandledrejection=e=>{throw e.reason||e};async function handleMessage(e){try{var msgData=e["data"];var cmd=msgData.cmd;if(cmd==="load"){let messageQueue=[];self.onmessage=e=>messageQueue.push(e);startWorker=()=>{postMessage({cmd:"loaded"});for(let msg of messageQueue){handleMessage(msg)}self.onmessage=handleMessage};for(const handler of msgData.handlers){if(!Module[handler]||Module[handler].proxy){Module[handler]=(...args)=>{postMessage({cmd:"callHandler",handler,args})};if(handler=="print")out=Module[handler];if(handler=="printErr")err=Module[handler]}}wasmMemory=msgData.wasmMemory;updateMemoryViews();wasmModule=msgData.wasmModule;createWasm();run()}else if(cmd==="run"){establishStackSpace(msgData.pthread_ptr);__emscripten_thread_init(msgData.pthread_ptr,0,0,1,0,0);PThread.threadInitTLS();__emscripten_thread_mailbox_await(msgData.pthread_ptr);if(!initializedJS){initializedJS=true}try{await invokeEntryPoint(msgData.start_routine,msgData.arg)}catch(ex){if(ex!="unwind"){throw ex}}}else if(msgData.target==="setimmediate"){}else if(cmd==="checkMailbox"){if(initializedJS){checkMailbox()}}else if(cmd){err(`worker: received unknown command ${cmd}`);err(msgData)}}catch(ex){__emscripten_thread_crashed();throw ex}}self.onmessage=handleMessage}var HEAP8,HEAPU8,HEAP16,HEAPU16,HEAP32,HEAPU32,HEAPF32,HEAPF64;var HEAP64,HEAPU64;var runtimeInitialized=false;function updateMemoryViews(){var b=wasmMemory.buffer;HEAP8=new Int8Array(b);HEAP16=new Int16Array(b);Module["HEAPU8"]=HEAPU8=new Uint8Array(b);HEAPU16=new Uint16Array(b);HEAP32=new Int32Array(b);HEAPU32=new Uint32Array(b);HEAPF32=new Float32Array(b);HEAPF64=new Float64Array(b);HEAP64=new BigInt64Array(b);HEAPU64=new BigUint64Array(b)}function initMemory(){if(ENVIRONMENT_IS_PTHREAD){return}if(Module["wasmMemory"]){wasmMemory=Module["wasmMemory"]}else{var INITIAL_MEMORY=Module["INITIAL_MEMORY"]||134217728;wasmMemory=new WebAssembly.Memory({initial:BigInt(INITIAL_MEMORY/65536),maximum:65536n,shared:true,address:"i64"})}updateMemoryViews()}function preRun(){if(Module["preRun"]){if(typeof Module["preRun"]=="function")Module["preRun"]=[Module["preRun"]];while(Module["preRun"].length){addOnPreRun(Module["preRun"].shift())}}callRuntimeCallbacks(onPreRuns)}function initRuntime(){runtimeInitialized=true;if(ENVIRONMENT_IS_PTHREAD)return startWorker();if(!Module["noFSInit"]&&!FS.initialized)FS.init();TTY.init();wasmExports["__wasm_call_ctors"]();FS.ignorePermissions=false}function preMain(){}function postRun(){if(ENVIRONMENT_IS_PTHREAD){return}if(Module["postRun"]){if(typeof Module["postRun"]=="function")Module["postRun"]=[Module["postRun"]];while(Module["postRun"].length){addOnPostRun(Module["postRun"].shift())}}callRuntimeCallbacks(onPostRuns)}function abort(what){Module["onAbort"]?.(what);what="Aborted("+what+")";err(what);ABORT=true;what+=". Build with -sASSERTIONS for more info.";if(runtimeInitialized){___trap()}var e=new WebAssembly.RuntimeError(what);throw e}var wasmBinaryFile;function findWasmBinary(){return locateFile("wllama.wasm")}function getBinarySync(file){if(file==wasmBinaryFile&&wasmBinary){return new Uint8Array(wasmBinary)}if(readBinary){return readBinary(file)}throw"both async and sync fetching of the wasm failed"}async function getWasmBinary(binaryFile){if(!wasmBinary){try{var response=await readAsync(binaryFile);return new Uint8Array(response)}catch{}}return getBinarySync(binaryFile)}async function instantiateArrayBuffer(binaryFile,imports){try{var binary=await getWasmBinary(binaryFile);var instance=await WebAssembly.instantiate(binary,imports);return instance}catch(reason){err(`failed to asynchronously prepare wasm: ${reason}`);abort(reason)}}async function instantiateAsync(binary,binaryFile,imports){if(!binary&&!isFileURI(binaryFile)&&!ENVIRONMENT_IS_NODE){try{var response=fetch(binaryFile,{credentials:"same-origin"});var instantiationResult=await WebAssembly.instantiateStreaming(response,imports);return instantiationResult}catch(reason){err(`wasm streaming compile failed: ${reason}`);err("falling back to ArrayBuffer instantiation")}}return instantiateArrayBuffer(binaryFile,imports)}function getWasmImports(){assignWasmImports();if(!wasmImports.__instrumented){wasmImports.__instrumented=true;Asyncify.instrumentWasmImports(wasmImports)}var imports={env:wasmImports,wasi_snapshot_preview1:wasmImports};return imports}async function createWasm(){function receiveInstance(instance,module){wasmExports=instance.exports;wasmExports=Asyncify.instrumentWasmExports(wasmExports);wasmExports=applySignatureConversions(wasmExports);registerTLSInit(wasmExports["_emscripten_tls_init"]);assignWasmExports(wasmExports);wasmModule=module;removeRunDependency("wasm-instantiate");return wasmExports}addRunDependency("wasm-instantiate");function receiveInstantiationResult(result){return receiveInstance(result["instance"],result["module"])}var info=getWasmImports();if(Module["instantiateWasm"]){return new Promise((resolve,reject)=>{Module["instantiateWasm"](info,(inst,mod)=>{resolve(receiveInstance(inst,mod))})})}if(ENVIRONMENT_IS_PTHREAD){var instance=new WebAssembly.Instance(wasmModule,getWasmImports());return receiveInstance(instance,wasmModule)}wasmBinaryFile??=findWasmBinary();var result=await instantiateAsync(wasmBinary,wasmBinaryFile,info);var exports=receiveInstantiationResult(result);return exports}class ExitStatus{name="ExitStatus";constructor(status){this.message=`Program terminated with exit(${status})`;this.status=status}}var terminateWorker=worker=>{worker.terminate();worker.onmessage=e=>{}};var cleanupThread=pthread_ptr=>{var worker=PThread.pthreads[pthread_ptr];PThread.returnWorkerToPool(worker)};var callRuntimeCallbacks=callbacks=>{while(callbacks.length>0){callbacks.shift()(Module)}};var onPreRuns=[];var addOnPreRun=cb=>onPreRuns.push(cb);var runDependencies=0;var dependenciesFulfilled=null;var removeRunDependency=id=>{runDependencies--;Module["monitorRunDependencies"]?.(runDependencies);if(runDependencies==0){if(dependenciesFulfilled){var callback=dependenciesFulfilled;dependenciesFulfilled=null;callback()}}};var addRunDependency=id=>{runDependencies++;Module["monitorRunDependencies"]?.(runDependencies)};var spawnThread=threadParams=>{var worker=PThread.getNewWorker();if(!worker){return 6}PThread.runningWorkers.push(worker);PThread.pthreads[threadParams.pthread_ptr]=worker;worker.pthread_ptr=threadParams.pthread_ptr;var msg={cmd:"run",start_routine:threadParams.startRoutine,arg:threadParams.arg,pthread_ptr:threadParams.pthread_ptr};if(ENVIRONMENT_IS_NODE){worker.unref()}worker.postMessage(msg,threadParams.transferList);return 0};var runtimeKeepaliveCounter=0;var keepRuntimeAlive=()=>noExitRuntime||runtimeKeepaliveCounter>0;var stackSave=()=>_emscripten_stack_get_current();var stackRestore=val=>__emscripten_stack_restore(val);var stackAlloc=sz=>__emscripten_stack_alloc(sz);var proxyToMainThread=(funcIndex,emAsmAddr,sync,...callArgs)=>{var serializedNumCallArgs=callArgs.length*2;var sp=stackSave();var args=stackAlloc(serializedNumCallArgs*8);var b=args/8;for(var i=0;i<callArgs.length;i++){var arg=callArgs[i];if(typeof arg=="bigint"){(growMemViews(),HEAP64)[b+2*i]=1n;(growMemViews(),HEAP64)[b+2*i+1]=arg}else{(growMemViews(),HEAP64)[b+2*i]=0n;(growMemViews(),HEAPF64)[b+2*i+1]=arg}}var rtn=__emscripten_run_js_on_main_thread(funcIndex,emAsmAddr,serializedNumCallArgs,args,sync);stackRestore(sp);return rtn};function _proc_exit(code){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(0,0,1,code);EXITSTATUS=code;if(!keepRuntimeAlive()){PThread.terminateAllThreads();Module["onExit"]?.(code);ABORT=true}quit_(code,new ExitStatus(code))}function exitOnMainThread(returnCode){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(1,0,0,returnCode);_exit(returnCode)}var exitJS=(status,implicit)=>{EXITSTATUS=status;if(ENVIRONMENT_IS_PTHREAD){exitOnMainThread(status);throw"unwind"}_proc_exit(status)};var _exit=exitJS;var PThread={unusedWorkers:[],runningWorkers:[],tlsInitFunctions:[],pthreads:{},init(){if(!ENVIRONMENT_IS_PTHREAD){PThread.initMainThread()}},initMainThread(){var pthreadPoolSize=Module["pthreadPoolSize"];while(pthreadPoolSize--){PThread.allocateUnusedWorker()}addOnPreRun(async()=>{var pthreadPoolReady=PThread.loadWasmModuleToAllWorkers();addRunDependency("loading-workers");await pthreadPoolReady;removeRunDependency("loading-workers")})},terminateAllThreads:()=>{for(var worker of PThread.runningWorkers){terminateWorker(worker)}for(var worker of PThread.unusedWorkers){terminateWorker(worker)}PThread.unusedWorkers=[];PThread.runningWorkers=[];PThread.pthreads={}},returnWorkerToPool:worker=>{var pthread_ptr=worker.pthread_ptr;delete PThread.pthreads[pthread_ptr];PThread.unusedWorkers.push(worker);PThread.runningWorkers.splice(PThread.runningWorkers.indexOf(worker),1);worker.pthread_ptr=0;__emscripten_thread_free_data(pthread_ptr)},threadInitTLS(){PThread.tlsInitFunctions.forEach(f=>f())},loadWasmModuleToWorker:worker=>new Promise(onFinishedLoading=>{worker.onmessage=e=>{var d=e["data"];var cmd=d.cmd;if(d.targetThread&&d.targetThread!=_pthread_self()){var targetWorker=PThread.pthreads[d.targetThread];if(targetWorker){targetWorker.postMessage(d,d.transferList)}else{err(`Internal error! Worker sent a message "${cmd}" to target pthread ${d.targetThread}, but that thread no longer exists!`)}return}if(cmd==="checkMailbox"){checkMailbox()}else if(cmd==="spawnThread"){spawnThread(d)}else if(cmd==="cleanupThread"){callUserCallback(()=>cleanupThread(d.thread))}else if(cmd==="loaded"){worker.loaded=true;if(ENVIRONMENT_IS_NODE&&!worker.pthread_ptr){worker.unref()}onFinishedLoading(worker)}else if(d.target==="setimmediate"){worker.postMessage(d)}else if(cmd==="uncaughtException"){worker.onerror(d.error)}else if(cmd==="callHandler"){Module[d.handler](...d.args)}else if(cmd){err(`worker sent an unknown command ${cmd}`)}};worker.onerror=e=>{var message="worker sent an error!";err(`${message} ${e.filename}:${e.lineno}: ${e.message}`);throw e};if(ENVIRONMENT_IS_NODE){worker.on("message",data=>worker.onmessage({data}));worker.on("error",e=>worker.onerror(e))}var handlers=[];var knownHandlers=["onExit","onAbort","print","printErr"];for(var handler of knownHandlers){if(Module.propertyIsEnumerable(handler)){handlers.push(handler)}}worker.postMessage({cmd:"load",handlers,wasmMemory,wasmModule})}),async loadWasmModuleToAllWorkers(){if(ENVIRONMENT_IS_PTHREAD){return}let pthreadPoolReady=Promise.all(PThread.unusedWorkers.map(PThread.loadWasmModuleToWorker));return pthreadPoolReady},allocateUnusedWorker(){var worker;var pthreadMainJs=_scriptName;if(Module["mainScriptUrlOrBlob"]){pthreadMainJs=Module["mainScriptUrlOrBlob"];if(typeof pthreadMainJs!="string"){pthreadMainJs=URL.createObjectURL(pthreadMainJs)}}worker=new Worker(pthreadMainJs,{workerData:"em-pthread",name:"em-pthread"});PThread.unusedWorkers.push(worker)},getNewWorker(){if(PThread.unusedWorkers.length==0){PThread.allocateUnusedWorker();PThread.loadWasmModuleToWorker(PThread.unusedWorkers[0])}return PThread.unusedWorkers.pop()}};var onPostRuns=[];var addOnPostRun=cb=>onPostRuns.push(cb);function establishStackSpace(pthread_ptr){var stackHigh=Number((growMemViews(),HEAPU64)[(pthread_ptr+88)/8]);var stackSize=Number((growMemViews(),HEAPU64)[(pthread_ptr+96)/8]);var stackLow=stackHigh-stackSize;_emscripten_stack_set_limits(stackHigh,stackLow);stackRestore(stackHigh)}var wasmTableMirror=[];var getWasmTableEntry=funcPtr=>{funcPtr=Number(funcPtr);var func=wasmTableMirror[funcPtr];if(!func){wasmTableMirror[funcPtr]=func=wasmTable.get(BigInt(funcPtr));if(Asyncify.isAsyncExport(func)){wasmTableMirror[funcPtr]=func=Asyncify.makeAsyncFunction(func)}}return func};var invokeEntryPoint=async(ptr,arg)=>{runtimeKeepaliveCounter=0;noExitRuntime=0;var result=(a1=>WebAssembly.promising(getWasmTableEntry(ptr)).call(null,BigInt(a1)))(arg);function finish(result){if(keepRuntimeAlive()){EXITSTATUS=result;return}__emscripten_thread_exit(result)}result=await result;finish(result)};invokeEntryPoint.isAsync=true;var noExitRuntime=true;var registerTLSInit=tlsInitFunc=>PThread.tlsInitFunctions.push(tlsInitFunc);var wasmMemory;function pthreadCreateProxied(pthread_ptr,attr,startRoutine,arg){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(2,0,1,pthread_ptr,attr,startRoutine,arg);return ___pthread_create_js(pthread_ptr,attr,startRoutine,arg)}var _emscripten_has_threading_support=()=>!!globalThis.SharedArrayBuffer;var INT53_MAX=9007199254740992;var INT53_MIN=-9007199254740992;var bigintToI53Checked=num=>num<INT53_MIN||num>INT53_MAX?NaN:Number(num);function ___pthread_create_js(pthread_ptr,attr,startRoutine,arg){pthread_ptr=bigintToI53Checked(pthread_ptr);attr=bigintToI53Checked(attr);startRoutine=bigintToI53Checked(startRoutine);arg=bigintToI53Checked(arg);if(!_emscripten_has_threading_support()){return 6}var transferList=[];var error=0;if(ENVIRONMENT_IS_PTHREAD&&(transferList.length===0||error)){return pthreadCreateProxied(pthread_ptr,attr,startRoutine,arg)}if(error)return error;var threadParams={startRoutine,pthread_ptr,arg,transferList};if(ENVIRONMENT_IS_PTHREAD){threadParams.cmd="spawnThread";postMessage(threadParams,transferList);return 0}return spawnThread(threadParams)}var syscallGetVarargP=()=>{var ret=Number((growMemViews(),HEAPU64)[SYSCALLS.varargs/8]);SYSCALLS.varargs+=8;return ret};var syscallGetVarargI=()=>{var ret=(growMemViews(),HEAP32)[+SYSCALLS.varargs/4];SYSCALLS.varargs+=4;return ret};var PATH={isAbs:path=>path.charAt(0)==="/",splitPath:filename=>{var splitPathRe=/^(\\/?|)([\\s\\S]*?)((?:\\.{1,2}|[^\\/]+?|)(\\.[^.\\/]*|))(?:[\\/]*)$/;return splitPathRe.exec(filename).slice(1)},normalizeArray:(parts,allowAboveRoot)=>{var up=0;for(var i=parts.length-1;i>=0;i--){var last=parts[i];if(last==="."){parts.splice(i,1)}else if(last===".."){parts.splice(i,1);up++}else if(up){parts.splice(i,1);up--}}if(allowAboveRoot){for(;up;up--){parts.unshift("..")}}return parts},normalize:path=>{var isAbsolute=PATH.isAbs(path),trailingSlash=path.slice(-1)==="/";path=PATH.normalizeArray(path.split("/").filter(p=>!!p),!isAbsolute).join("/");if(!path&&!isAbsolute){path="."}if(path&&trailingSlash){path+="/"}return(isAbsolute?"/":"")+path},dirname:path=>{var result=PATH.splitPath(path),root=result[0],dir=result[1];if(!root&&!dir){return"."}if(dir){dir=dir.slice(0,-1)}return root+dir},basename:path=>path&&path.match(/([^\\/]+|\\/)\\/*$/)[1],join:(...paths)=>PATH.normalize(paths.join("/")),join2:(l,r)=>PATH.normalize(l+"/"+r)};var initRandomFill=()=>view=>view.set(crypto.getRandomValues(new Uint8Array(view.byteLength)));var randomFill=view=>{(randomFill=initRandomFill())(view)};var PATH_FS={resolve:(...args)=>{var resolvedPath="",resolvedAbsolute=false;for(var i=args.length-1;i>=-1&&!resolvedAbsolute;i--){var path=i>=0?args[i]:FS.cwd();if(typeof path!="string"){throw new TypeError("Arguments to path.resolve must be strings")}else if(!path){return""}resolvedPath=path+"/"+resolvedPath;resolvedAbsolute=PATH.isAbs(path)}resolvedPath=PATH.normalizeArray(resolvedPath.split("/").filter(p=>!!p),!resolvedAbsolute).join("/");return(resolvedAbsolute?"/":"")+resolvedPath||"."},relative:(from,to)=>{from=PATH_FS.resolve(from).slice(1);to=PATH_FS.resolve(to).slice(1);function trim(arr){var start=0;for(;start<arr.length;start++){if(arr[start]!=="")break}var end=arr.length-1;for(;end>=0;end--){if(arr[end]!=="")break}if(start>end)return[];return arr.slice(start,end-start+1)}var fromParts=trim(from.split("/"));var toParts=trim(to.split("/"));var length=Math.min(fromParts.length,toParts.length);var samePartsLength=length;for(var i=0;i<length;i++){if(fromParts[i]!==toParts[i]){samePartsLength=i;break}}var outputParts=[];for(var i=samePartsLength;i<fromParts.length;i++){outputParts.push("..")}outputParts=outputParts.concat(toParts.slice(samePartsLength));return outputParts.join("/")}};var UTF8Decoder=globalThis.TextDecoder&&new TextDecoder;var findStringEnd=(heapOrArray,idx,maxBytesToRead,ignoreNul)=>{var maxIdx=idx+maxBytesToRead;if(ignoreNul)return maxIdx;while(heapOrArray[idx]&&!(idx>=maxIdx))++idx;return idx};var UTF8ArrayToString=(heapOrArray,idx=0,maxBytesToRead,ignoreNul)=>{var endPtr=findStringEnd(heapOrArray,idx,maxBytesToRead,ignoreNul);if(endPtr-idx>16&&heapOrArray.buffer&&UTF8Decoder){return UTF8Decoder.decode(heapOrArray.buffer instanceof ArrayBuffer?heapOrArray.subarray(idx,endPtr):heapOrArray.slice(idx,endPtr))}var str="";while(idx<endPtr){var u0=heapOrArray[idx++];if(!(u0&128)){str+=String.fromCharCode(u0);continue}var u1=heapOrArray[idx++]&63;if((u0&224)==192){str+=String.fromCharCode((u0&31)<<6|u1);continue}var u2=heapOrArray[idx++]&63;if((u0&240)==224){u0=(u0&15)<<12|u1<<6|u2}else{u0=(u0&7)<<18|u1<<12|u2<<6|heapOrArray[idx++]&63}if(u0<65536){str+=String.fromCharCode(u0)}else{var ch=u0-65536;str+=String.fromCharCode(55296|ch>>10,56320|ch&1023)}}return str};var FS_stdin_getChar_buffer=[];var lengthBytesUTF8=str=>{var len=0;for(var i=0;i<str.length;++i){var c=str.charCodeAt(i);if(c<=127){len++}else if(c<=2047){len+=2}else if(c>=55296&&c<=57343){len+=4;++i}else{len+=3}}return len};var stringToUTF8Array=(str,heap,outIdx,maxBytesToWrite)=>{if(!(maxBytesToWrite>0))return 0;var startIdx=outIdx;var endIdx=outIdx+maxBytesToWrite-1;for(var i=0;i<str.length;++i){var u=str.codePointAt(i);if(u<=127){if(outIdx>=endIdx)break;heap[outIdx++]=u}else if(u<=2047){if(outIdx+1>=endIdx)break;heap[outIdx++]=192|u>>6;heap[outIdx++]=128|u&63}else if(u<=65535){if(outIdx+2>=endIdx)break;heap[outIdx++]=224|u>>12;heap[outIdx++]=128|u>>6&63;heap[outIdx++]=128|u&63}else{if(outIdx+3>=endIdx)break;heap[outIdx++]=240|u>>18;heap[outIdx++]=128|u>>12&63;heap[outIdx++]=128|u>>6&63;heap[outIdx++]=128|u&63;i++}}heap[outIdx]=0;return outIdx-startIdx};var intArrayFromString=(stringy,dontAddNull,length)=>{var len=length>0?length:lengthBytesUTF8(stringy)+1;var u8array=new Array(len);var numBytesWritten=stringToUTF8Array(stringy,u8array,0,u8array.length);if(dontAddNull)u8array.length=numBytesWritten;return u8array};var FS_stdin_getChar=()=>{if(!FS_stdin_getChar_buffer.length){var result=null;if(ENVIRONMENT_IS_NODE){var BUFSIZE=256;var buf=Buffer.alloc(BUFSIZE);var bytesRead=0;var fd=process.stdin.fd;try{bytesRead=fs.readSync(fd,buf,0,BUFSIZE)}catch(e){if(e.toString().includes("EOF"))bytesRead=0;else throw e}if(bytesRead>0){result=buf.slice(0,bytesRead).toString("utf-8")}}else if(globalThis.window?.prompt){result=window.prompt("Input: ");if(result!==null){result+="\\n"}}else{}if(!result){return null}FS_stdin_getChar_buffer=intArrayFromString(result,true)}return FS_stdin_getChar_buffer.shift()};var TTY={ttys:[],init(){},shutdown(){},register(dev,ops){TTY.ttys[dev]={input:[],output:[],ops};FS.registerDevice(dev,TTY.stream_ops)},stream_ops:{open(stream){var tty=TTY.ttys[stream.node.rdev];if(!tty){throw new FS.ErrnoError(43)}stream.tty=tty;stream.seekable=false},close(stream){stream.tty.ops.fsync(stream.tty)},fsync(stream){stream.tty.ops.fsync(stream.tty)},read(stream,buffer,offset,length,pos){if(!stream.tty||!stream.tty.ops.get_char){throw new FS.ErrnoError(60)}var bytesRead=0;for(var i=0;i<length;i++){var result;try{result=stream.tty.ops.get_char(stream.tty)}catch(e){throw new FS.ErrnoError(29)}if(result===undefined&&bytesRead===0){throw new FS.ErrnoError(6)}if(result===null||result===undefined)break;bytesRead++;buffer[offset+i]=result}if(bytesRead){stream.node.atime=Date.now()}return bytesRead},write(stream,buffer,offset,length,pos){if(!stream.tty||!stream.tty.ops.put_char){throw new FS.ErrnoError(60)}try{for(var i=0;i<length;i++){stream.tty.ops.put_char(stream.tty,buffer[offset+i])}}catch(e){throw new FS.ErrnoError(29)}if(length){stream.node.mtime=stream.node.ctime=Date.now()}return i}},default_tty_ops:{get_char(tty){return FS_stdin_getChar()},put_char(tty,val){if(val===null||val===10){out(UTF8ArrayToString(tty.output));tty.output=[]}else{if(val!=0)tty.output.push(val)}},fsync(tty){if(tty.output?.length>0){out(UTF8ArrayToString(tty.output));tty.output=[]}},ioctl_tcgets(tty){return{c_iflag:25856,c_oflag:5,c_cflag:191,c_lflag:35387,c_cc:[3,28,127,21,4,0,1,0,17,19,26,0,18,15,23,22,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]}},ioctl_tcsets(tty,optional_actions,data){return 0},ioctl_tiocgwinsz(tty){return[24,80]}},default_tty1_ops:{put_char(tty,val){if(val===null||val===10){err(UTF8ArrayToString(tty.output));tty.output=[]}else{if(val!=0)tty.output.push(val)}},fsync(tty){if(tty.output?.length>0){err(UTF8ArrayToString(tty.output));tty.output=[]}}}};var zeroMemory=(ptr,size)=>(growMemViews(),HEAPU8).fill(0,ptr,ptr+size);var alignMemory=(size,alignment)=>Math.ceil(size/alignment)*alignment;var mmapAlloc=size=>{size=alignMemory(size,65536);var ptr=_emscripten_builtin_memalign(65536,size);if(ptr)zeroMemory(ptr,size);return ptr};var MEMFS={ops_table:null,mount(mount){return MEMFS.createNode(null,"/",16895,0)},createNode(parent,name,mode,dev){if(FS.isBlkdev(mode)||FS.isFIFO(mode)){throw new FS.ErrnoError(63)}MEMFS.ops_table||={dir:{node:{getattr:MEMFS.node_ops.getattr,setattr:MEMFS.node_ops.setattr,lookup:MEMFS.node_ops.lookup,mknod:MEMFS.node_ops.mknod,rename:MEMFS.node_ops.rename,unlink:MEMFS.node_ops.unlink,rmdir:MEMFS.node_ops.rmdir,readdir:MEMFS.node_ops.readdir,symlink:MEMFS.node_ops.symlink},stream:{llseek:MEMFS.stream_ops.llseek}},file:{node:{getattr:MEMFS.node_ops.getattr,setattr:MEMFS.node_ops.setattr},stream:{llseek:MEMFS.stream_ops.llseek,read:MEMFS.stream_ops.read,write:MEMFS.stream_ops.write,mmap:MEMFS.stream_ops.mmap,msync:MEMFS.stream_ops.msync}},link:{node:{getattr:MEMFS.node_ops.getattr,setattr:MEMFS.node_ops.setattr,readlink:MEMFS.node_ops.readlink},stream:{}},chrdev:{node:{getattr:MEMFS.node_ops.getattr,setattr:MEMFS.node_ops.setattr},stream:FS.chrdev_stream_ops}};var node=FS.createNode(parent,name,mode,dev);if(FS.isDir(node.mode)){node.node_ops=MEMFS.ops_table.dir.node;node.stream_ops=MEMFS.ops_table.dir.stream;node.contents={}}else if(FS.isFile(node.mode)){node.node_ops=MEMFS.ops_table.file.node;node.stream_ops=MEMFS.ops_table.file.stream;node.usedBytes=0;node.contents=null}else if(FS.isLink(node.mode)){node.node_ops=MEMFS.ops_table.link.node;node.stream_ops=MEMFS.ops_table.link.stream}else if(FS.isChrdev(node.mode)){node.node_ops=MEMFS.ops_table.chrdev.node;node.stream_ops=MEMFS.ops_table.chrdev.stream}node.atime=node.mtime=node.ctime=Date.now();if(parent){parent.contents[name]=node;parent.atime=parent.mtime=parent.ctime=node.atime}return node},getFileDataAsTypedArray(node){if(!node.contents)return new Uint8Array(0);if(node.contents.subarray)return node.contents.subarray(0,node.usedBytes);return new Uint8Array(node.contents)},expandFileStorage(node,newCapacity){var prevCapacity=node.contents?node.contents.length:0;if(prevCapacity>=newCapacity)return;var CAPACITY_DOUBLING_MAX=1024*1024;newCapacity=Math.max(newCapacity,prevCapacity*(prevCapacity<CAPACITY_DOUBLING_MAX?2:1.125)>>>0);if(prevCapacity!=0)newCapacity=Math.max(newCapacity,256);var oldContents=node.contents;node.contents=new Uint8Array(newCapacity);if(node.usedBytes>0)node.contents.set(oldContents.subarray(0,node.usedBytes),0)},resizeFileStorage(node,newSize){if(node.usedBytes==newSize)return;if(newSize==0){node.contents=null;node.usedBytes=0}else{var oldContents=node.contents;node.contents=new Uint8Array(newSize);if(oldContents){node.contents.set(oldContents.subarray(0,Math.min(newSize,node.usedBytes)))}node.usedBytes=newSize}},node_ops:{getattr(node){var attr={};attr.dev=FS.isChrdev(node.mode)?node.id:1;attr.ino=node.id;attr.mode=node.mode;attr.nlink=1;attr.uid=0;attr.gid=0;attr.rdev=node.rdev;if(FS.isDir(node.mode)){attr.size=4096}else if(FS.isFile(node.mode)){attr.size=node.usedBytes}else if(FS.isLink(node.mode)){attr.size=node.link.length}else{attr.size=0}attr.atime=new Date(node.atime);attr.mtime=new Date(node.mtime);attr.ctime=new Date(node.ctime);attr.blksize=4096;attr.blocks=Math.ceil(attr.size/attr.blksize);return attr},setattr(node,attr){for(const key of["mode","atime","mtime","ctime"]){if(attr[key]!=null){node[key]=attr[key]}}if(attr.size!==undefined){MEMFS.resizeFileStorage(node,attr.size)}},lookup(parent,name){if(!MEMFS.doesNotExistError){MEMFS.doesNotExistError=new FS.ErrnoError(44);MEMFS.doesNotExistError.stack="<generic error, no stack>"}throw MEMFS.doesNotExistError},mknod(parent,name,mode,dev){return MEMFS.createNode(parent,name,mode,dev)},rename(old_node,new_dir,new_name){var new_node;try{new_node=FS.lookupNode(new_dir,new_name)}catch(e){}if(new_node){if(FS.isDir(old_node.mode)){for(var i in new_node.contents){throw new FS.ErrnoError(55)}}FS.hashRemoveNode(new_node)}delete old_node.parent.contents[old_node.name];new_dir.contents[new_name]=old_node;old_node.name=new_name;new_dir.ctime=new_dir.mtime=old_node.parent.ctime=old_node.parent.mtime=Date.now()},unlink(parent,name){delete parent.contents[name];parent.ctime=parent.mtime=Date.now()},rmdir(parent,name){var node=FS.lookupNode(parent,name);for(var i in node.contents){throw new FS.ErrnoError(55)}delete parent.contents[name];parent.ctime=parent.mtime=Date.now()},readdir(node){return[".","..",...Object.keys(node.contents)]},symlink(parent,newname,oldpath){var node=MEMFS.createNode(parent,newname,511|40960,0);node.link=oldpath;return node},readlink(node){if(!FS.isLink(node.mode)){throw new FS.ErrnoError(28)}return node.link}},stream_ops:{read(stream,buffer,offset,length,position){var contents=stream.node.contents;if(position>=stream.node.usedBytes)return 0;var size=Math.min(stream.node.usedBytes-position,length);if(size>8&&contents.subarray){buffer.set(contents.subarray(position,position+size),offset)}else{for(var i=0;i<size;i++)buffer[offset+i]=contents[position+i]}return size},write(stream,buffer,offset,length,position,canOwn){if(buffer.buffer===(growMemViews(),HEAP8).buffer){canOwn=false}if(!length)return 0;var node=stream.node;node.mtime=node.ctime=Date.now();if(buffer.subarray&&(!node.contents||node.contents.subarray)){if(canOwn){node.contents=buffer.subarray(offset,offset+length);node.usedBytes=length;return length}else if(node.usedBytes===0&&position===0){node.contents=buffer.slice(offset,offset+length);node.usedBytes=length;return length}else if(position+length<=node.usedBytes){node.contents.set(buffer.subarray(offset,offset+length),position);return length}}MEMFS.expandFileStorage(node,position+length);if(node.contents.subarray&&buffer.subarray){node.contents.set(buffer.subarray(offset,offset+length),position)}else{for(var i=0;i<length;i++){node.contents[position+i]=buffer[offset+i]}}node.usedBytes=Math.max(node.usedBytes,position+length);return length},llseek(stream,offset,whence){var position=offset;if(whence===1){position+=stream.position}else if(whence===2){if(FS.isFile(stream.node.mode)){position+=stream.node.usedBytes}}if(position<0){throw new FS.ErrnoError(28)}return position},mmap(stream,length,position,prot,flags){if(!FS.isFile(stream.node.mode)){throw new FS.ErrnoError(43)}var ptr;var allocated;var contents=stream.node.contents;if(!(flags&2)&&contents&&contents.buffer===(growMemViews(),HEAP8).buffer){allocated=false;ptr=contents.byteOffset}else{allocated=true;ptr=mmapAlloc(length);if(!ptr){throw new FS.ErrnoError(48)}if(contents){if(position>0||position+length<contents.length){if(contents.subarray){contents=contents.subarray(position,position+length)}else{contents=Array.prototype.slice.call(contents,position,position+length)}}(growMemViews(),HEAP8).set(contents,ptr)}}return{ptr,allocated}},msync(stream,buffer,offset,length,mmapFlags){MEMFS.stream_ops.write(stream,buffer,0,length,offset,false);return 0}}};var FS_modeStringToFlags=str=>{var flagModes={r:0,"r+":2,w:512|64|1,"w+":512|64|2,a:1024|64|1,"a+":1024|64|2};var flags=flagModes[str];if(typeof flags=="undefined"){throw new Error(`Unknown file open mode: ${str}`)}return flags};var FS_getMode=(canRead,canWrite)=>{var mode=0;if(canRead)mode|=292|73;if(canWrite)mode|=146;return mode};var asyncLoad=async url=>{var arrayBuffer=await readAsync(url);return new Uint8Array(arrayBuffer)};var FS_createDataFile=(...args)=>FS.createDataFile(...args);var getUniqueRunDependency=id=>id;var preloadPlugins=[];var FS_handledByPreloadPlugin=async(byteArray,fullname)=>{if(typeof Browser!="undefined")Browser.init();for(var plugin of preloadPlugins){if(plugin["canHandle"](fullname)){return plugin["handle"](byteArray,fullname)}}return byteArray};var FS_preloadFile=async(parent,name,url,canRead,canWrite,dontCreateFile,canOwn,preFinish)=>{var fullname=name?PATH_FS.resolve(PATH.join2(parent,name)):parent;var dep=getUniqueRunDependency(`cp ${fullname}`);addRunDependency(dep);try{var byteArray=url;if(typeof url=="string"){byteArray=await asyncLoad(url)}byteArray=await FS_handledByPreloadPlugin(byteArray,fullname);preFinish?.();if(!dontCreateFile){FS_createDataFile(parent,name,byteArray,canRead,canWrite,canOwn)}}finally{removeRunDependency(dep)}};var FS_createPreloadedFile=(parent,name,url,canRead,canWrite,onload,onerror,dontCreateFile,canOwn,preFinish)=>{FS_preloadFile(parent,name,url,canRead,canWrite,dontCreateFile,canOwn,preFinish).then(onload).catch(onerror)};var FS={root:null,mounts:[],devices:{},streams:[],nextInode:1,nameTable:null,currentPath:"/",initialized:false,ignorePermissions:true,filesystems:null,syncFSRequests:0,readFiles:{},ErrnoError:class{name="ErrnoError";constructor(errno){this.errno=errno}},FSStream:class{shared={};get object(){return this.node}set object(val){this.node=val}get isRead(){return(this.flags&2097155)!==1}get isWrite(){return(this.flags&2097155)!==0}get isAppend(){return this.flags&1024}get flags(){return this.shared.flags}set flags(val){this.shared.flags=val}get position(){return this.shared.position}set position(val){this.shared.position=val}},FSNode:class{node_ops={};stream_ops={};readMode=292|73;writeMode=146;mounted=null;constructor(parent,name,mode,rdev){if(!parent){parent=this}this.parent=parent;this.mount=parent.mount;this.id=FS.nextInode++;this.name=name;this.mode=mode;this.rdev=rdev;this.atime=this.mtime=this.ctime=Date.now()}get read(){return(this.mode&this.readMode)===this.readMode}set read(val){val?this.mode|=this.readMode:this.mode&=~this.readMode}get write(){return(this.mode&this.writeMode)===this.writeMode}set write(val){val?this.mode|=this.writeMode:this.mode&=~this.writeMode}get isFolder(){return FS.isDir(this.mode)}get isDevice(){return FS.isChrdev(this.mode)}},lookupPath(path,opts={}){if(!path){throw new FS.ErrnoError(44)}opts.follow_mount??=true;if(!PATH.isAbs(path)){path=FS.cwd()+"/"+path}linkloop:for(var nlinks=0;nlinks<40;nlinks++){var parts=path.split("/").filter(p=>!!p);var current=FS.root;var current_path="/";for(var i=0;i<parts.length;i++){var islast=i===parts.length-1;if(islast&&opts.parent){break}if(parts[i]==="."){continue}if(parts[i]===".."){current_path=PATH.dirname(current_path);if(FS.isRoot(current)){path=current_path+"/"+parts.slice(i+1).join("/");nlinks--;continue linkloop}else{current=current.parent}continue}current_path=PATH.join2(current_path,parts[i]);try{current=FS.lookupNode(current,parts[i])}catch(e){if(e?.errno===44&&islast&&opts.noent_okay){return{path:current_path}}throw e}if(FS.isMountpoint(current)&&(!islast||opts.follow_mount)){current=current.mounted.root}if(FS.isLink(current.mode)&&(!islast||opts.follow)){if(!current.node_ops.readlink){throw new FS.ErrnoError(52)}var link=current.node_ops.readlink(current);if(!PATH.isAbs(link)){link=PATH.dirname(current_path)+"/"+link}path=link+"/"+parts.slice(i+1).join("/");continue linkloop}}return{path:current_path,node:current}}throw new FS.ErrnoError(32)},getPath(node){var path;while(true){if(FS.isRoot(node)){var mount=node.mount.mountpoint;if(!path)return mount;return mount[mount.length-1]!=="/"?`${mount}/${path}`:mount+path}path=path?`${node.name}/${path}`:node.name;node=node.parent}},hashName(parentid,name){var hash=0;for(var i=0;i<name.length;i++){hash=(hash<<5)-hash+name.charCodeAt(i)|0}return(parentid+hash>>>0)%FS.nameTable.length},hashAddNode(node){var hash=FS.hashName(node.parent.id,node.name);node.name_next=FS.nameTable[hash];FS.nameTable[hash]=node},hashRemoveNode(node){var hash=FS.hashName(node.parent.id,node.name);if(FS.nameTable[hash]===node){FS.nameTable[hash]=node.name_next}else{var current=FS.nameTable[hash];while(current){if(current.name_next===node){current.name_next=node.name_next;break}current=current.name_next}}},lookupNode(parent,name){var errCode=FS.mayLookup(parent);if(errCode){throw new FS.ErrnoError(errCode)}var hash=FS.hashName(parent.id,name);for(var node=FS.nameTable[hash];node;node=node.name_next){var nodeName=node.name;if(node.parent.id===parent.id&&nodeName===name){return node}}return FS.lookup(parent,name)},createNode(parent,name,mode,rdev){var node=new FS.FSNode(parent,name,mode,rdev);FS.hashAddNode(node);return node},destroyNode(node){FS.hashRemoveNode(node)},isRoot(node){return node===node.parent},isMountpoint(node){return!!node.mounted},isFile(mode){return(mode&61440)===32768},isDir(mode){return(mode&61440)===16384},isLink(mode){return(mode&61440)===40960},isChrdev(mode){return(mode&61440)===8192},isBlkdev(mode){return(mode&61440)===24576},isFIFO(mode){return(mode&61440)===4096},isSocket(mode){return(mode&49152)===49152},flagsToPermissionString(flag){var perms=["r","w","rw"][flag&3];if(flag&512){perms+="w"}return perms},nodePermissions(node,perms){if(FS.ignorePermissions){return 0}if(perms.includes("r")&&!(node.mode&292)){return 2}else if(perms.includes("w")&&!(node.mode&146)){return 2}else if(perms.includes("x")&&!(node.mode&73)){return 2}return 0},mayLookup(dir){if(!FS.isDir(dir.mode))return 54;var errCode=FS.nodePermissions(dir,"x");if(errCode)return errCode;if(!dir.node_ops.lookup)return 2;return 0},mayCreate(dir,name){if(!FS.isDir(dir.mode)){return 54}try{var node=FS.lookupNode(dir,name);return 20}catch(e){}return FS.nodePermissions(dir,"wx")},mayDelete(dir,name,isdir){var node;try{node=FS.lookupNode(dir,name)}catch(e){return e.errno}var errCode=FS.nodePermissions(dir,"wx");if(errCode){return errCode}if(isdir){if(!FS.isDir(node.mode)){return 54}if(FS.isRoot(node)||FS.getPath(node)===FS.cwd()){return 10}}else{if(FS.isDir(node.mode)){return 31}}return 0},mayOpen(node,flags){if(!node){return 44}if(FS.isLink(node.mode)){return 32}else if(FS.isDir(node.mode)){if(FS.flagsToPermissionString(flags)!=="r"||flags&(512|64)){return 31}}return FS.nodePermissions(node,FS.flagsToPermissionString(flags))},checkOpExists(op,err){if(!op){throw new FS.ErrnoError(err)}return op},MAX_OPEN_FDS:4096,nextfd(){for(var fd=0;fd<=FS.MAX_OPEN_FDS;fd++){if(!FS.streams[fd]){return fd}}throw new FS.ErrnoError(33)},getStreamChecked(fd){var stream=FS.getStream(fd);if(!stream){throw new FS.ErrnoError(8)}return stream},getStream:fd=>FS.streams[fd],createStream(stream,fd=-1){stream=Object.assign(new FS.FSStream,stream);if(fd==-1){fd=FS.nextfd()}stream.fd=fd;FS.streams[fd]=stream;return stream},closeStream(fd){FS.streams[fd]=null},dupStream(origStream,fd=-1){var stream=FS.createStream(origStream,fd);stream.stream_ops?.dup?.(stream);return stream},doSetAttr(stream,node,attr){var setattr=stream?.stream_ops.setattr;var arg=setattr?stream:node;setattr??=node.node_ops.setattr;FS.checkOpExists(setattr,63);setattr(arg,attr)},chrdev_stream_ops:{open(stream){var device=FS.getDevice(stream.node.rdev);stream.stream_ops=device.stream_ops;stream.stream_ops.open?.(stream)},llseek(){throw new FS.ErrnoError(70)}},major:dev=>dev>>8,minor:dev=>dev&255,makedev:(ma,mi)=>ma<<8|mi,registerDevice(dev,ops){FS.devices[dev]={stream_ops:ops}},getDevice:dev=>FS.devices[dev],getMounts(mount){var mounts=[];var check=[mount];while(check.length){var m=check.pop();mounts.push(m);check.push(...m.mounts)}return mounts},syncfs(populate,callback){if(typeof populate=="function"){callback=populate;populate=false}FS.syncFSRequests++;if(FS.syncFSRequests>1){err(`warning: ${FS.syncFSRequests} FS.syncfs operations in flight at once, probably just doing extra work`)}var mounts=FS.getMounts(FS.root.mount);var completed=0;function doCallback(errCode){FS.syncFSRequests--;return callback(errCode)}function done(errCode){if(errCode){if(!done.errored){done.errored=true;return doCallback(errCode)}return}if(++completed>=mounts.length){doCallback(null)}}for(var mount of mounts){if(mount.type.syncfs){mount.type.syncfs(mount,populate,done)}else{done(null)}}},mount(type,opts,mountpoint){var root=mountpoint==="/";var pseudo=!mountpoint;var node;if(root&&FS.root){throw new FS.ErrnoError(10)}else if(!root&&!pseudo){var lookup=FS.lookupPath(mountpoint,{follow_mount:false});mountpoint=lookup.path;node=lookup.node;if(FS.isMountpoint(node)){throw new FS.ErrnoError(10)}if(!FS.isDir(node.mode)){throw new FS.ErrnoError(54)}}var mount={type,opts,mountpoint,mounts:[]};var mountRoot=type.mount(mount);mountRoot.mount=mount;mount.root=mountRoot;if(root){FS.root=mountRoot}else if(node){node.mounted=mount;if(node.mount){node.mount.mounts.push(mount)}}return mountRoot},unmount(mountpoint){var lookup=FS.lookupPath(mountpoint,{follow_mount:false});if(!FS.isMountpoint(lookup.node)){throw new FS.ErrnoError(28)}var node=lookup.node;var mount=node.mounted;var mounts=FS.getMounts(mount);for(var[hash,current]of Object.entries(FS.nameTable)){while(current){var next=current.name_next;if(mounts.includes(current.mount)){FS.destroyNode(current)}current=next}}node.mounted=null;var idx=node.mount.mounts.indexOf(mount);node.mount.mounts.splice(idx,1)},lookup(parent,name){return parent.node_ops.lookup(parent,name)},mknod(path,mode,dev){var lookup=FS.lookupPath(path,{parent:true});var parent=lookup.node;var name=PATH.basename(path);if(!name){throw new FS.ErrnoError(28)}if(name==="."||name===".."){throw new FS.ErrnoError(20)}var errCode=FS.mayCreate(parent,name);if(errCode){throw new FS.ErrnoError(errCode)}if(!parent.node_ops.mknod){throw new FS.ErrnoError(63)}return parent.node_ops.mknod(parent,name,mode,dev)},statfs(path){return FS.statfsNode(FS.lookupPath(path,{follow:true}).node)},statfsStream(stream){return FS.statfsNode(stream.node)},statfsNode(node){var rtn={bsize:4096,frsize:4096,blocks:1e6,bfree:5e5,bavail:5e5,files:FS.nextInode,ffree:FS.nextInode-1,fsid:42,flags:2,namelen:255};if(node.node_ops.statfs){Object.assign(rtn,node.node_ops.statfs(node.mount.opts.root))}return rtn},create(path,mode=438){mode&=4095;mode|=32768;return FS.mknod(path,mode,0)},mkdir(path,mode=511){mode&=511|512;mode|=16384;return FS.mknod(path,mode,0)},mkdirTree(path,mode){var dirs=path.split("/");var d="";for(var dir of dirs){if(!dir)continue;if(d||PATH.isAbs(path))d+="/";d+=dir;try{FS.mkdir(d,mode)}catch(e){if(e.errno!=20)throw e}}},mkdev(path,mode,dev){if(typeof dev=="undefined"){dev=mode;mode=438}mode|=8192;return FS.mknod(path,mode,dev)},symlink(oldpath,newpath){if(!PATH_FS.resolve(oldpath)){throw new FS.ErrnoError(44)}var lookup=FS.lookupPath(newpath,{parent:true});var parent=lookup.node;if(!parent){throw new FS.ErrnoError(44)}var newname=PATH.basename(newpath);var errCode=FS.mayCreate(parent,newname);if(errCode){throw new FS.ErrnoError(errCode)}if(!parent.node_ops.symlink){throw new FS.ErrnoError(63)}return parent.node_ops.symlink(parent,newname,oldpath)},rename(old_path,new_path){var old_dirname=PATH.dirname(old_path);var new_dirname=PATH.dirname(new_path);var old_name=PATH.basename(old_path);var new_name=PATH.basename(new_path);var lookup,old_dir,new_dir;lookup=FS.lookupPath(old_path,{parent:true});old_dir=lookup.node;lookup=FS.lookupPath(new_path,{parent:true});new_dir=lookup.node;if(!old_dir||!new_dir)throw new FS.ErrnoError(44);if(old_dir.mount!==new_dir.mount){throw new FS.ErrnoError(75)}var old_node=FS.lookupNode(old_dir,old_name);var relative=PATH_FS.relative(old_path,new_dirname);if(relative.charAt(0)!=="."){throw new FS.ErrnoError(28)}relative=PATH_FS.relative(new_path,old_dirname);if(relative.charAt(0)!=="."){throw new FS.ErrnoError(55)}var new_node;try{new_node=FS.lookupNode(new_dir,new_name)}catch(e){}if(old_node===new_node){return}var isdir=FS.isDir(old_node.mode);var errCode=FS.mayDelete(old_dir,old_name,isdir);if(errCode){throw new FS.ErrnoError(errCode)}errCode=new_node?FS.mayDelete(new_dir,new_name,isdir):FS.mayCreate(new_dir,new_name);if(errCode){throw new FS.ErrnoError(errCode)}if(!old_dir.node_ops.rename){throw new FS.ErrnoError(63)}if(FS.isMountpoint(old_node)||new_node&&FS.isMountpoint(new_node)){throw new FS.ErrnoError(10)}if(new_dir!==old_dir){errCode=FS.nodePermissions(old_dir,"w");if(errCode){throw new FS.ErrnoError(errCode)}}FS.hashRemoveNode(old_node);try{old_dir.node_ops.rename(old_node,new_dir,new_name);old_node.parent=new_dir}catch(e){throw e}finally{FS.hashAddNode(old_node)}},rmdir(path){var lookup=FS.lookupPath(path,{parent:true});var parent=lookup.node;var name=PATH.basename(path);var node=FS.lookupNode(parent,name);var errCode=FS.mayDelete(parent,name,true);if(errCode){throw new FS.ErrnoError(errCode)}if(!parent.node_ops.rmdir){throw new FS.ErrnoError(63)}if(FS.isMountpoint(node)){throw new FS.ErrnoError(10)}parent.node_ops.rmdir(parent,name);FS.destroyNode(node)},readdir(path){var lookup=FS.lookupPath(path,{follow:true});var node=lookup.node;var readdir=FS.checkOpExists(node.node_ops.readdir,54);return readdir(node)},unlink(path){var lookup=FS.lookupPath(path,{parent:true});var parent=lookup.node;if(!parent){throw new FS.ErrnoError(44)}var name=PATH.basename(path);var node=FS.lookupNode(parent,name);var errCode=FS.mayDelete(parent,name,false);if(errCode){throw new FS.ErrnoError(errCode)}if(!parent.node_ops.unlink){throw new FS.ErrnoError(63)}if(FS.isMountpoint(node)){throw new FS.ErrnoError(10)}parent.node_ops.unlink(parent,name);FS.destroyNode(node)},readlink(path){var lookup=FS.lookupPath(path);var link=lookup.node;if(!link){throw new FS.ErrnoError(44)}if(!link.node_ops.readlink){throw new FS.ErrnoError(28)}return link.node_ops.readlink(link)},stat(path,dontFollow){var lookup=FS.lookupPath(path,{follow:!dontFollow});var node=lookup.node;var getattr=FS.checkOpExists(node.node_ops.getattr,63);return getattr(node)},fstat(fd){var stream=FS.getStreamChecked(fd);var node=stream.node;var getattr=stream.stream_ops.getattr;var arg=getattr?stream:node;getattr??=node.node_ops.getattr;FS.checkOpExists(getattr,63);return getattr(arg)},lstat(path){return FS.stat(path,true)},doChmod(stream,node,mode,dontFollow){FS.doSetAttr(stream,node,{mode:mode&4095|node.mode&~4095,ctime:Date.now(),dontFollow})},chmod(path,mode,dontFollow){var node;if(typeof path=="string"){var lookup=FS.lookupPath(path,{follow:!dontFollow});node=lookup.node}else{node=path}FS.doChmod(null,node,mode,dontFollow)},lchmod(path,mode){FS.chmod(path,mode,true)},fchmod(fd,mode){var stream=FS.getStreamChecked(fd);FS.doChmod(stream,stream.node,mode,false)},doChown(stream,node,dontFollow){FS.doSetAttr(stream,node,{timestamp:Date.now(),dontFollow})},chown(path,uid,gid,dontFollow){var node;if(typeof path=="string"){var lookup=FS.lookupPath(path,{follow:!dontFollow});node=lookup.node}else{node=path}FS.doChown(null,node,dontFollow)},lchown(path,uid,gid){FS.chown(path,uid,gid,true)},fchown(fd,uid,gid){var stream=FS.getStreamChecked(fd);FS.doChown(stream,stream.node,false)},doTruncate(stream,node,len){if(FS.isDir(node.mode)){throw new FS.ErrnoError(31)}if(!FS.isFile(node.mode)){throw new FS.ErrnoError(28)}var errCode=FS.nodePermissions(node,"w");if(errCode){throw new FS.ErrnoError(errCode)}FS.doSetAttr(stream,node,{size:len,timestamp:Date.now()})},truncate(path,len){if(len<0){throw new FS.ErrnoError(28)}var node;if(typeof path=="string"){var lookup=FS.lookupPath(path,{follow:true});node=lookup.node}else{node=path}FS.doTruncate(null,node,len)},ftruncate(fd,len){var stream=FS.getStreamChecked(fd);if(len<0||(stream.flags&2097155)===0){throw new FS.ErrnoError(28)}FS.doTruncate(stream,stream.node,len)},utime(path,atime,mtime){var lookup=FS.lookupPath(path,{follow:true});var node=lookup.node;var setattr=FS.checkOpExists(node.node_ops.setattr,63);setattr(node,{atime,mtime})},open(path,flags,mode=438){if(path===""){throw new FS.ErrnoError(44)}flags=typeof flags=="string"?FS_modeStringToFlags(flags):flags;if(flags&64){mode=mode&4095|32768}else{mode=0}var node;var isDirPath;if(typeof path=="object"){node=path}else{isDirPath=path.endsWith("/");var lookup=FS.lookupPath(path,{follow:!(flags&131072),noent_okay:true});node=lookup.node;path=lookup.path}var created=false;if(flags&64){if(node){if(flags&128){throw new FS.ErrnoError(20)}}else if(isDirPath){throw new FS.ErrnoError(31)}else{node=FS.mknod(path,mode|511,0);created=true}}if(!node){throw new FS.ErrnoError(44)}if(FS.isChrdev(node.mode)){flags&=~512}if(flags&65536&&!FS.isDir(node.mode)){throw new FS.ErrnoError(54)}if(!created){var errCode=FS.mayOpen(node,flags);if(errCode){throw new FS.ErrnoError(errCode)}}if(flags&512&&!created){FS.truncate(node,0)}flags&=~(128|512|131072);var stream=FS.createStream({node,path:FS.getPath(node),flags,seekable:true,position:0,stream_ops:node.stream_ops,ungotten:[],error:false});if(stream.stream_ops.open){stream.stream_ops.open(stream)}if(created){FS.chmod(node,mode&511)}if(Module["logReadFiles"]&&!(flags&1)){if(!(path in FS.readFiles)){FS.readFiles[path]=1}}return stream},close(stream){if(FS.isClosed(stream)){throw new FS.ErrnoError(8)}if(stream.getdents)stream.getdents=null;try{if(stream.stream_ops.close){stream.stream_ops.close(stream)}}catch(e){throw e}finally{FS.closeStream(stream.fd)}stream.fd=null},isClosed(stream){return stream.fd===null},llseek(stream,offset,whence){if(FS.isClosed(stream)){throw new FS.ErrnoError(8)}if(!stream.seekable||!stream.stream_ops.llseek){throw new FS.ErrnoError(70)}if(whence!=0&&whence!=1&&whence!=2){throw new FS.ErrnoError(28)}stream.position=stream.stream_ops.llseek(stream,offset,whence);stream.ungotten=[];return stream.position},read(stream,buffer,offset,length,position){if(length<0||position<0){throw new FS.ErrnoError(28)}if(FS.isClosed(stream)){throw new FS.ErrnoError(8)}if((stream.flags&2097155)===1){throw new FS.ErrnoError(8)}if(FS.isDir(stream.node.mode)){throw new FS.ErrnoError(31)}if(!stream.stream_ops.read){throw new FS.ErrnoError(28)}var seeking=typeof position!="undefined";if(!seeking){position=stream.position}else if(!stream.seekable){throw new FS.ErrnoError(70)}var bytesRead=stream.stream_ops.read(stream,buffer,offset,length,position);if(!seeking)stream.position+=bytesRead;return bytesRead},write(stream,buffer,offset,length,position,canOwn){if(length<0||position<0){throw new FS.ErrnoError(28)}if(FS.isClosed(stream)){throw new FS.ErrnoError(8)}if((stream.flags&2097155)===0){throw new FS.ErrnoError(8)}if(FS.isDir(stream.node.mode)){throw new FS.ErrnoError(31)}if(!stream.stream_ops.write){throw new FS.ErrnoError(28)}if(stream.seekable&&stream.flags&1024){FS.llseek(stream,0,2)}var seeking=typeof position!="undefined";if(!seeking){position=stream.position}else if(!stream.seekable){throw new FS.ErrnoError(70)}var bytesWritten=stream.stream_ops.write(stream,buffer,offset,length,position,canOwn);if(!seeking)stream.position+=bytesWritten;return bytesWritten},mmap(stream,length,position,prot,flags){if((prot&2)!==0&&(flags&2)===0&&(stream.flags&2097155)!==2){throw new FS.ErrnoError(2)}if((stream.flags&2097155)===1){throw new FS.ErrnoError(2)}if(!stream.stream_ops.mmap){throw new FS.ErrnoError(43)}if(!length){throw new FS.ErrnoError(28)}return stream.stream_ops.mmap(stream,length,position,prot,flags)},msync(stream,buffer,offset,length,mmapFlags){if(!stream.stream_ops.msync){return 0}return stream.stream_ops.msync(stream,buffer,offset,length,mmapFlags)},ioctl(stream,cmd,arg){if(!stream.stream_ops.ioctl){throw new FS.ErrnoError(59)}return stream.stream_ops.ioctl(stream,cmd,arg)},readFile(path,opts={}){opts.flags=opts.flags||0;opts.encoding=opts.encoding||"binary";if(opts.encoding!=="utf8"&&opts.encoding!=="binary"){abort(`Invalid encoding type "${opts.encoding}"`)}var stream=FS.open(path,opts.flags);var stat=FS.stat(path);var length=stat.size;var buf=new Uint8Array(length);FS.read(stream,buf,0,length,0);if(opts.encoding==="utf8"){buf=UTF8ArrayToString(buf)}FS.close(stream);return buf},writeFile(path,data,opts={}){opts.flags=opts.flags||577;var stream=FS.open(path,opts.flags,opts.mode);if(typeof data=="string"){data=new Uint8Array(intArrayFromString(data,true))}if(ArrayBuffer.isView(data)){FS.write(stream,data,0,data.byteLength,undefined,opts.canOwn)}else{abort("Unsupported data type")}FS.close(stream)},cwd:()=>FS.currentPath,chdir(path){var lookup=FS.lookupPath(path,{follow:true});if(lookup.node===null){throw new FS.ErrnoError(44)}if(!FS.isDir(lookup.node.mode)){throw new FS.ErrnoError(54)}var errCode=FS.nodePermissions(lookup.node,"x");if(errCode){throw new FS.ErrnoError(errCode)}FS.currentPath=lookup.path},createDefaultDirectories(){FS.mkdir("/tmp");FS.mkdir("/home");FS.mkdir("/home/web_user")},createDefaultDevices(){FS.mkdir("/dev");FS.registerDevice(FS.makedev(1,3),{read:()=>0,write:(stream,buffer,offset,length,pos)=>length,llseek:()=>0});FS.mkdev("/dev/null",FS.makedev(1,3));TTY.register(FS.makedev(5,0),TTY.default_tty_ops);TTY.register(FS.makedev(6,0),TTY.default_tty1_ops);FS.mkdev("/dev/tty",FS.makedev(5,0));FS.mkdev("/dev/tty1",FS.makedev(6,0));var randomBuffer=new Uint8Array(1024),randomLeft=0;var randomByte=()=>{if(randomLeft===0){randomFill(randomBuffer);randomLeft=randomBuffer.byteLength}return randomBuffer[--randomLeft]};FS.createDevice("/dev","random",randomByte);FS.createDevice("/dev","urandom",randomByte);FS.mkdir("/dev/shm");FS.mkdir("/dev/shm/tmp")},createSpecialDirectories(){FS.mkdir("/proc");var proc_self=FS.mkdir("/proc/self");FS.mkdir("/proc/self/fd");FS.mount({mount(){var node=FS.createNode(proc_self,"fd",16895,73);node.stream_ops={llseek:MEMFS.stream_ops.llseek};node.node_ops={lookup(parent,name){var fd=+name;var stream=FS.getStreamChecked(fd);var ret={parent:null,mount:{mountpoint:"fake"},node_ops:{readlink:()=>stream.path},id:fd+1};ret.parent=ret;return ret},readdir(){return Array.from(FS.streams.entries()).filter(([k,v])=>v).map(([k,v])=>k.toString())}};return node}},{},"/proc/self/fd")},createStandardStreams(input,output,error){if(input){FS.createDevice("/dev","stdin",input)}else{FS.symlink("/dev/tty","/dev/stdin")}if(output){FS.createDevice("/dev","stdout",null,output)}else{FS.symlink("/dev/tty","/dev/stdout")}if(error){FS.createDevice("/dev","stderr",null,error)}else{FS.symlink("/dev/tty1","/dev/stderr")}var stdin=FS.open("/dev/stdin",0);var stdout=FS.open("/dev/stdout",1);var stderr=FS.open("/dev/stderr",1)},staticInit(){FS.nameTable=new Array(4096);FS.mount(MEMFS,{},"/");FS.createDefaultDirectories();FS.createDefaultDevices();FS.createSpecialDirectories();FS.filesystems={MEMFS}},init(input,output,error){FS.initialized=true;input??=Module["stdin"];output??=Module["stdout"];error??=Module["stderr"];FS.createStandardStreams(input,output,error)},quit(){FS.initialized=false;for(var stream of FS.streams){if(stream){FS.close(stream)}}},findObject(path,dontResolveLastLink){var ret=FS.analyzePath(path,dontResolveLastLink);if(!ret.exists){return null}return ret.object},analyzePath(path,dontResolveLastLink){try{var lookup=FS.lookupPath(path,{follow:!dontResolveLastLink});path=lookup.path}catch(e){}var ret={isRoot:false,exists:false,error:0,name:null,path:null,object:null,parentExists:false,parentPath:null,parentObject:null};try{var lookup=FS.lookupPath(path,{parent:true});ret.parentExists=true;ret.parentPath=lookup.path;ret.parentObject=lookup.node;ret.name=PATH.basename(path);lookup=FS.lookupPath(path,{follow:!dontResolveLastLink});ret.exists=true;ret.path=lookup.path;ret.object=lookup.node;ret.name=lookup.node.name;ret.isRoot=lookup.path==="/"}catch(e){ret.error=e.errno}return ret},createPath(parent,path,canRead,canWrite){parent=typeof parent=="string"?parent:FS.getPath(parent);var parts=path.split("/").reverse();while(parts.length){var part=parts.pop();if(!part)continue;var current=PATH.join2(parent,part);try{FS.mkdir(current)}catch(e){if(e.errno!=20)throw e}parent=current}return current},createFile(parent,name,properties,canRead,canWrite){var path=PATH.join2(typeof parent=="string"?parent:FS.getPath(parent),name);var mode=FS_getMode(canRead,canWrite);return FS.create(path,mode)},createDataFile(parent,name,data,canRead,canWrite,canOwn){var path=name;if(parent){parent=typeof parent=="string"?parent:FS.getPath(parent);path=name?PATH.join2(parent,name):parent}var mode=FS_getMode(canRead,canWrite);var node=FS.create(path,mode);if(data){if(typeof data=="string"){var arr=new Array(data.length);for(var i=0,len=data.length;i<len;++i)arr[i]=data.charCodeAt(i);data=arr}FS.chmod(node,mode|146);var stream=FS.open(node,577);FS.write(stream,data,0,data.length,0,canOwn);FS.close(stream);FS.chmod(node,mode)}},createDevice(parent,name,input,output){var path=PATH.join2(typeof parent=="string"?parent:FS.getPath(parent),name);var mode=FS_getMode(!!input,!!output);FS.createDevice.major??=64;var dev=FS.makedev(FS.createDevice.major++,0);FS.registerDevice(dev,{open(stream){stream.seekable=false},close(stream){if(output?.buffer?.length){output(10)}},read(stream,buffer,offset,length,pos){var bytesRead=0;for(var i=0;i<length;i++){var result;try{result=input()}catch(e){throw new FS.ErrnoError(29)}if(result===undefined&&bytesRead===0){throw new FS.ErrnoError(6)}if(result===null||result===undefined)break;bytesRead++;buffer[offset+i]=result}if(bytesRead){stream.node.atime=Date.now()}return bytesRead},write(stream,buffer,offset,length,pos){for(var i=0;i<length;i++){try{output(buffer[offset+i])}catch(e){throw new FS.ErrnoError(29)}}if(length){stream.node.mtime=stream.node.ctime=Date.now()}return i}});return FS.mkdev(path,mode,dev)},forceLoadFile(obj){if(obj.isDevice||obj.isFolder||obj.link||obj.contents)return true;if(globalThis.XMLHttpRequest){abort("Lazy loading should have been performed (contents set) in createLazyFile, but it was not. Lazy loading only works in web workers. Use --embed-file or --preload-file in emcc on the main thread.")}else{try{obj.contents=readBinary(obj.url)}catch(e){throw new FS.ErrnoError(29)}}},createLazyFile(parent,name,url,canRead,canWrite){class LazyUint8Array{lengthKnown=false;chunks=[];get(idx){if(idx>this.length-1||idx<0){return undefined}var chunkOffset=idx%this.chunkSize;var chunkNum=idx/this.chunkSize|0;return this.getter(chunkNum)[chunkOffset]}setDataGetter(getter){this.getter=getter}cacheLength(){var xhr=new XMLHttpRequest;xhr.open("HEAD",url,false);xhr.send(null);if(!(xhr.status>=200&&xhr.status<300||xhr.status===304))abort("Couldn\'t load "+url+". Status: "+xhr.status);var datalength=Number(xhr.getResponseHeader("Content-length"));var header;var hasByteServing=(header=xhr.getResponseHeader("Accept-Ranges"))&&header==="bytes";var usesGzip=(header=xhr.getResponseHeader("Content-Encoding"))&&header==="gzip";var chunkSize=1024*1024;if(!hasByteServing)chunkSize=datalength;var doXHR=(from,to)=>{if(from>to)abort("invalid range ("+from+", "+to+") or no bytes requested!");if(to>datalength-1)abort("only "+datalength+" bytes available! programmer error!");var xhr=new XMLHttpRequest;xhr.open("GET",url,false);if(datalength!==chunkSize)xhr.setRequestHeader("Range","bytes="+from+"-"+to);xhr.responseType="arraybuffer";if(xhr.overrideMimeType){xhr.overrideMimeType("text/plain; charset=x-user-defined")}xhr.send(null);if(!(xhr.status>=200&&xhr.status<300||xhr.status===304))abort("Couldn\'t load "+url+". Status: "+xhr.status);if(xhr.response!==undefined){return new Uint8Array(xhr.response||[])}return intArrayFromString(xhr.responseText||"",true)};var lazyArray=this;lazyArray.setDataGetter(chunkNum=>{var start=chunkNum*chunkSize;var end=(chunkNum+1)*chunkSize-1;end=Math.min(end,datalength-1);if(typeof lazyArray.chunks[chunkNum]=="undefined"){lazyArray.chunks[chunkNum]=doXHR(start,end)}if(typeof lazyArray.chunks[chunkNum]=="undefined")abort("doXHR failed!");return lazyArray.chunks[chunkNum]});if(usesGzip||!datalength){chunkSize=datalength=1;datalength=this.getter(0).length;chunkSize=datalength;out("LazyFiles on gzip forces download of the whole file when length is accessed")}this._length=datalength;this._chunkSize=chunkSize;this.lengthKnown=true}get length(){if(!this.lengthKnown){this.cacheLength()}return this._length}get chunkSize(){if(!this.lengthKnown){this.cacheLength()}return this._chunkSize}}if(globalThis.XMLHttpRequest){if(!ENVIRONMENT_IS_WORKER)abort("Cannot do synchronous binary XHRs outside webworkers in modern browsers. Use --embed-file or --preload-file in emcc");var lazyArray=new LazyUint8Array;var properties={isDevice:false,contents:lazyArray}}else{var properties={isDevice:false,url}}var node=FS.createFile(parent,name,properties,canRead,canWrite);if(properties.contents){node.contents=properties.contents}else if(properties.url){node.contents=null;node.url=properties.url}Object.defineProperties(node,{usedBytes:{get:function(){return this.contents.length}}});var stream_ops={};for(const[key,fn]of Object.entries(node.stream_ops)){stream_ops[key]=(...args)=>{FS.forceLoadFile(node);return fn(...args)}}function writeChunks(stream,buffer,offset,length,position){var contents=stream.node.contents;if(position>=contents.length)return 0;var size=Math.min(contents.length-position,length);if(contents.slice){for(var i=0;i<size;i++){buffer[offset+i]=contents[position+i]}}else{for(var i=0;i<size;i++){buffer[offset+i]=contents.get(position+i)}}return size}stream_ops.read=(stream,buffer,offset,length,position)=>{FS.forceLoadFile(node);return writeChunks(stream,buffer,offset,length,position)};stream_ops.mmap=(stream,length,position,prot,flags)=>{FS.forceLoadFile(node);var ptr=mmapAlloc(length);if(!ptr){throw new FS.ErrnoError(48)}writeChunks(stream,(growMemViews(),HEAP8),ptr,length,position);return{ptr,allocated:true}};node.stream_ops=stream_ops;return node}};var UTF8ToString=(ptr,maxBytesToRead,ignoreNul)=>ptr?UTF8ArrayToString((growMemViews(),HEAPU8),ptr,maxBytesToRead,ignoreNul):"";var SYSCALLS={DEFAULT_POLLMASK:5,calculateAt(dirfd,path,allowEmpty){if(PATH.isAbs(path)){return path}var dir;if(dirfd===-100){dir=FS.cwd()}else{var dirstream=SYSCALLS.getStreamFromFD(dirfd);dir=dirstream.path}if(path.length==0){if(!allowEmpty){throw new FS.ErrnoError(44)}return dir}return dir+"/"+path},writeStat(buf,stat){(growMemViews(),HEAPU32)[buf/4]=stat.dev;(growMemViews(),HEAPU32)[(buf+4)/4]=stat.mode;(growMemViews(),HEAPU64)[(buf+8)/8]=BigInt(stat.nlink);(growMemViews(),HEAPU32)[(buf+16)/4]=stat.uid;(growMemViews(),HEAPU32)[(buf+20)/4]=stat.gid;(growMemViews(),HEAPU32)[(buf+24)/4]=stat.rdev;(growMemViews(),HEAP64)[(buf+32)/8]=BigInt(stat.size);(growMemViews(),HEAP32)[(buf+40)/4]=4096;(growMemViews(),HEAP32)[(buf+44)/4]=stat.blocks;var atime=stat.atime.getTime();var mtime=stat.mtime.getTime();var ctime=stat.ctime.getTime();(growMemViews(),HEAP64)[(buf+48)/8]=BigInt(Math.floor(atime/1e3));(growMemViews(),HEAPU64)[(buf+56)/8]=BigInt(atime%1e3*1e3*1e3);(growMemViews(),HEAP64)[(buf+64)/8]=BigInt(Math.floor(mtime/1e3));(growMemViews(),HEAPU64)[(buf+72)/8]=BigInt(mtime%1e3*1e3*1e3);(growMemViews(),HEAP64)[(buf+80)/8]=BigInt(Math.floor(ctime/1e3));(growMemViews(),HEAPU64)[(buf+88)/8]=BigInt(ctime%1e3*1e3*1e3);(growMemViews(),HEAP64)[(buf+96)/8]=BigInt(stat.ino);return 0},writeStatFs(buf,stats){(growMemViews(),HEAPU32)[(buf+8)/4]=stats.bsize;(growMemViews(),HEAPU32)[(buf+72)/4]=stats.bsize;(growMemViews(),HEAP64)[(buf+16)/8]=BigInt(stats.blocks);(growMemViews(),HEAP64)[(buf+24)/8]=BigInt(stats.bfree);(growMemViews(),HEAP64)[(buf+32)/8]=BigInt(stats.bavail);(growMemViews(),HEAP64)[(buf+40)/8]=BigInt(stats.files);(growMemViews(),HEAP64)[(buf+48)/8]=BigInt(stats.ffree);(growMemViews(),HEAPU32)[(buf+56)/4]=stats.fsid;(growMemViews(),HEAPU32)[(buf+80)/4]=stats.flags;(growMemViews(),HEAPU32)[(buf+64)/4]=stats.namelen},doMsync(addr,stream,len,flags,offset){if(!FS.isFile(stream.node.mode)){throw new FS.ErrnoError(43)}if(flags&2){return 0}var buffer=(growMemViews(),HEAPU8).slice(addr,addr+len);FS.msync(stream,buffer,offset,len,flags)},getStreamFromFD(fd){var stream=FS.getStreamChecked(fd);return stream},varargs:undefined,getStr(ptr){var ret=UTF8ToString(ptr);return ret}};function ___syscall_fcntl64(fd,cmd,varargs){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(3,0,1,fd,cmd,varargs);varargs=bigintToI53Checked(varargs);SYSCALLS.varargs=varargs;try{var stream=SYSCALLS.getStreamFromFD(fd);switch(cmd){case 0:{var arg=syscallGetVarargI();if(arg<0){return-28}while(FS.streams[arg]){arg++}var newStream;newStream=FS.dupStream(stream,arg);return newStream.fd}case 1:case 2:return 0;case 3:return stream.flags;case 4:{var arg=syscallGetVarargI();stream.flags|=arg;return 0}case 5:{var arg=syscallGetVarargP();var offset=0;(growMemViews(),HEAP16)[(arg+offset)/2]=2;return 0}case 6:case 7:return 0}return-28}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return-e.errno}}function ___syscall_fstat64(fd,buf){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(4,0,1,fd,buf);buf=bigintToI53Checked(buf);try{return SYSCALLS.writeStat(buf,FS.fstat(fd))}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return-e.errno}}var stringToUTF8=(str,outPtr,maxBytesToWrite)=>stringToUTF8Array(str,(growMemViews(),HEAPU8),outPtr,maxBytesToWrite);function ___syscall_getcwd(buf,size){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(5,0,1,buf,size);buf=bigintToI53Checked(buf);size=bigintToI53Checked(size);try{if(size===0)return-28;var cwd=FS.cwd();var cwdLengthInBytes=lengthBytesUTF8(cwd)+1;if(size<cwdLengthInBytes)return-68;stringToUTF8(cwd,buf,size);return cwdLengthInBytes}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return-e.errno}}function ___syscall_getdents64(fd,dirp,count){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(6,0,1,fd,dirp,count);dirp=bigintToI53Checked(dirp);count=bigintToI53Checked(count);try{var stream=SYSCALLS.getStreamFromFD(fd);stream.getdents||=FS.readdir(stream.path);var struct_size=280;var pos=0;var off=FS.llseek(stream,0,1);var startIdx=Math.floor(off/struct_size);var endIdx=Math.min(stream.getdents.length,startIdx+Math.floor(count/struct_size));for(var idx=startIdx;idx<endIdx;idx++){var id;var type;var name=stream.getdents[idx];if(name==="."){id=stream.node.id;type=4}else if(name===".."){var lookup=FS.lookupPath(stream.path,{parent:true});id=lookup.node.id;type=4}else{var child;try{child=FS.lookupNode(stream.node,name)}catch(e){if(e?.errno===28){continue}throw e}id=child.id;type=FS.isChrdev(child.mode)?2:FS.isDir(child.mode)?4:FS.isLink(child.mode)?10:8}(growMemViews(),HEAP64)[(dirp+pos)/8]=BigInt(id);(growMemViews(),HEAP64)[(dirp+pos+8)/8]=BigInt((idx+1)*struct_size);(growMemViews(),HEAP16)[(dirp+pos+16)/2]=280;(growMemViews(),HEAP8)[dirp+pos+18]=type;stringToUTF8(name,dirp+pos+19,256);pos+=struct_size}FS.llseek(stream,idx*struct_size,0);return pos}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return-e.errno}}function ___syscall_ioctl(fd,op,varargs){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(7,0,1,fd,op,varargs);varargs=bigintToI53Checked(varargs);SYSCALLS.varargs=varargs;try{var stream=SYSCALLS.getStreamFromFD(fd);switch(op){case 21509:{if(!stream.tty)return-59;return 0}case 21505:{if(!stream.tty)return-59;if(stream.tty.ops.ioctl_tcgets){var termios=stream.tty.ops.ioctl_tcgets(stream);var argp=syscallGetVarargP();(growMemViews(),HEAP32)[argp/4]=termios.c_iflag||0;(growMemViews(),HEAP32)[(argp+4)/4]=termios.c_oflag||0;(growMemViews(),HEAP32)[(argp+8)/4]=termios.c_cflag||0;(growMemViews(),HEAP32)[(argp+12)/4]=termios.c_lflag||0;for(var i=0;i<32;i++){(growMemViews(),HEAP8)[argp+i+17]=termios.c_cc[i]||0}return 0}return 0}case 21510:case 21511:case 21512:{if(!stream.tty)return-59;return 0}case 21506:case 21507:case 21508:{if(!stream.tty)return-59;if(stream.tty.ops.ioctl_tcsets){var argp=syscallGetVarargP();var c_iflag=(growMemViews(),HEAP32)[argp/4];var c_oflag=(growMemViews(),HEAP32)[(argp+4)/4];var c_cflag=(growMemViews(),HEAP32)[(argp+8)/4];var c_lflag=(growMemViews(),HEAP32)[(argp+12)/4];var c_cc=[];for(var i=0;i<32;i++){c_cc.push((growMemViews(),HEAP8)[argp+i+17])}return stream.tty.ops.ioctl_tcsets(stream.tty,op,{c_iflag,c_oflag,c_cflag,c_lflag,c_cc})}return 0}case 21519:{if(!stream.tty)return-59;var argp=syscallGetVarargP();(growMemViews(),HEAP32)[argp/4]=0;return 0}case 21520:{if(!stream.tty)return-59;return-28}case 21537:case 21531:{var argp=syscallGetVarargP();return FS.ioctl(stream,op,argp)}case 21523:{if(!stream.tty)return-59;if(stream.tty.ops.ioctl_tiocgwinsz){var winsize=stream.tty.ops.ioctl_tiocgwinsz(stream.tty);var argp=syscallGetVarargP();(growMemViews(),HEAP16)[argp/2]=winsize[0];(growMemViews(),HEAP16)[(argp+2)/2]=winsize[1]}return 0}case 21524:{if(!stream.tty)return-59;return 0}case 21515:{if(!stream.tty)return-59;return 0}default:return-28}}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return-e.errno}}function ___syscall_lstat64(path,buf){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(8,0,1,path,buf);path=bigintToI53Checked(path);buf=bigintToI53Checked(buf);try{path=SYSCALLS.getStr(path);return SYSCALLS.writeStat(buf,FS.lstat(path))}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return-e.errno}}function ___syscall_newfstatat(dirfd,path,buf,flags){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(9,0,1,dirfd,path,buf,flags);path=bigintToI53Checked(path);buf=bigintToI53Checked(buf);try{path=SYSCALLS.getStr(path);var nofollow=flags&256;var allowEmpty=flags&4096;flags=flags&~6400;path=SYSCALLS.calculateAt(dirfd,path,allowEmpty);return SYSCALLS.writeStat(buf,nofollow?FS.lstat(path):FS.stat(path))}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return-e.errno}}function ___syscall_openat(dirfd,path,flags,varargs){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(10,0,1,dirfd,path,flags,varargs);path=bigintToI53Checked(path);varargs=bigintToI53Checked(varargs);SYSCALLS.varargs=varargs;try{path=SYSCALLS.getStr(path);path=SYSCALLS.calculateAt(dirfd,path);var mode=varargs?syscallGetVarargI():0;return FS.open(path,flags,mode).fd}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return-e.errno}}function ___syscall_stat64(path,buf){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(11,0,1,path,buf);path=bigintToI53Checked(path);buf=bigintToI53Checked(buf);try{path=SYSCALLS.getStr(path);return SYSCALLS.writeStat(buf,FS.stat(path))}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return-e.errno}}var __abort_js=()=>abort("");function __emscripten_init_main_thread_js(tb){tb=bigintToI53Checked(tb);__emscripten_thread_init(tb,!ENVIRONMENT_IS_WORKER,1,!ENVIRONMENT_IS_WEB,5242880,false);PThread.threadInitTLS()}var handleException=e=>{if(e instanceof ExitStatus||e=="unwind"){return EXITSTATUS}quit_(1,e)};var maybeExit=()=>{if(!keepRuntimeAlive()){try{if(ENVIRONMENT_IS_PTHREAD){if(_pthread_self())__emscripten_thread_exit(EXITSTATUS);return}_exit(EXITSTATUS)}catch(e){handleException(e)}}};var callUserCallback=func=>{if(ABORT){return}try{func();maybeExit()}catch(e){handleException(e)}};function __emscripten_thread_mailbox_await(pthread_ptr){pthread_ptr=bigintToI53Checked(pthread_ptr);if(Atomics.waitAsync){var wait=Atomics.waitAsync((growMemViews(),HEAP32),pthread_ptr/4,pthread_ptr);wait.value.then(checkMailbox);var waitingAsync=pthread_ptr+228;Atomics.store((growMemViews(),HEAP32),waitingAsync/4,1)}}var checkMailbox=()=>callUserCallback(()=>{var pthread_ptr=_pthread_self();if(pthread_ptr){__emscripten_thread_mailbox_await(pthread_ptr);__emscripten_check_mailbox()}});function __emscripten_notify_mailbox_postmessage(targetThread,currThreadId){targetThread=bigintToI53Checked(targetThread);currThreadId=bigintToI53Checked(currThreadId);if(targetThread==currThreadId){setTimeout(checkMailbox)}else if(ENVIRONMENT_IS_PTHREAD){postMessage({targetThread,cmd:"checkMailbox"})}else{var worker=PThread.pthreads[targetThread];if(!worker){return}worker.postMessage({cmd:"checkMailbox"})}}var proxiedJSCallArgs=[];function __emscripten_receive_on_main_thread_js(funcIndex,emAsmAddr,callingThread,numCallArgs,args){emAsmAddr=bigintToI53Checked(emAsmAddr);callingThread=bigintToI53Checked(callingThread);args=bigintToI53Checked(args);numCallArgs/=2;proxiedJSCallArgs.length=numCallArgs;var b=args/8;for(var i=0;i<numCallArgs;i++){if((growMemViews(),HEAP64)[b+2*i]){proxiedJSCallArgs[i]=(growMemViews(),HEAP64)[b+2*i+1]}else{proxiedJSCallArgs[i]=(growMemViews(),HEAPF64)[b+2*i+1]}}var func=proxiedFunctionTable[funcIndex];PThread.currentProxiedOperationCallerThread=callingThread;var rtn=func(...proxiedJSCallArgs);PThread.currentProxiedOperationCallerThread=0;if(typeof rtn=="bigint"){rtn=bigintToI53Checked(rtn)}return rtn}function __emscripten_thread_cleanup(thread){thread=bigintToI53Checked(thread);if(!ENVIRONMENT_IS_PTHREAD)cleanupThread(thread);else postMessage({cmd:"cleanupThread",thread})}function __emscripten_thread_set_strongref(thread){thread=bigintToI53Checked(thread);if(ENVIRONMENT_IS_NODE){PThread.pthreads[thread].ref()}}var isLeapYear=year=>year%4===0&&(year%100!==0||year%400===0);var MONTH_DAYS_LEAP_CUMULATIVE=[0,31,60,91,121,152,182,213,244,274,305,335];var MONTH_DAYS_REGULAR_CUMULATIVE=[0,31,59,90,120,151,181,212,243,273,304,334];var ydayFromDate=date=>{var leap=isLeapYear(date.getFullYear());var monthDaysCumulative=leap?MONTH_DAYS_LEAP_CUMULATIVE:MONTH_DAYS_REGULAR_CUMULATIVE;var yday=monthDaysCumulative[date.getMonth()]+date.getDate()-1;return yday};function __localtime_js(time,tmPtr){time=bigintToI53Checked(time);tmPtr=bigintToI53Checked(tmPtr);var date=new Date(time*1e3);(growMemViews(),HEAP32)[tmPtr/4]=date.getSeconds();(growMemViews(),HEAP32)[(tmPtr+4)/4]=date.getMinutes();(growMemViews(),HEAP32)[(tmPtr+8)/4]=date.getHours();(growMemViews(),HEAP32)[(tmPtr+12)/4]=date.getDate();(growMemViews(),HEAP32)[(tmPtr+16)/4]=date.getMonth();(growMemViews(),HEAP32)[(tmPtr+20)/4]=date.getFullYear()-1900;(growMemViews(),HEAP32)[(tmPtr+24)/4]=date.getDay();var yday=ydayFromDate(date)|0;(growMemViews(),HEAP32)[(tmPtr+28)/4]=yday;(growMemViews(),HEAP64)[(tmPtr+40)/8]=BigInt(-(date.getTimezoneOffset()*60));var start=new Date(date.getFullYear(),0,1);var summerOffset=new Date(date.getFullYear(),6,1).getTimezoneOffset();var winterOffset=start.getTimezoneOffset();var dst=(summerOffset!=winterOffset&&date.getTimezoneOffset()==Math.min(winterOffset,summerOffset))|0;(growMemViews(),HEAP32)[(tmPtr+32)/4]=dst}function __mmap_js(len,prot,flags,fd,offset,allocated,addr){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(12,0,1,len,prot,flags,fd,offset,allocated,addr);len=bigintToI53Checked(len);offset=bigintToI53Checked(offset);allocated=bigintToI53Checked(allocated);addr=bigintToI53Checked(addr);try{var stream=SYSCALLS.getStreamFromFD(fd);var res=FS.mmap(stream,len,offset,prot,flags);var ptr=res.ptr;(growMemViews(),HEAP32)[allocated/4]=res.allocated;(growMemViews(),HEAPU64)[addr/8]=BigInt(ptr);return 0}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return-e.errno}}function __munmap_js(addr,len,prot,flags,fd,offset){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(13,0,1,addr,len,prot,flags,fd,offset);addr=bigintToI53Checked(addr);len=bigintToI53Checked(len);offset=bigintToI53Checked(offset);try{var stream=SYSCALLS.getStreamFromFD(fd);if(prot&2){SYSCALLS.doMsync(addr,stream,len,flags,offset)}}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return-e.errno}}var __tzset_js=function(timezone,daylight,std_name,dst_name){timezone=bigintToI53Checked(timezone);daylight=bigintToI53Checked(daylight);std_name=bigintToI53Checked(std_name);dst_name=bigintToI53Checked(dst_name);var currentYear=(new Date).getFullYear();var winter=new Date(currentYear,0,1);var summer=new Date(currentYear,6,1);var winterOffset=winter.getTimezoneOffset();var summerOffset=summer.getTimezoneOffset();var stdTimezoneOffset=Math.max(winterOffset,summerOffset);(growMemViews(),HEAPU64)[timezone/8]=BigInt(stdTimezoneOffset*60);(growMemViews(),HEAP32)[daylight/4]=Number(winterOffset!=summerOffset);var extractZone=timezoneOffset=>{var sign=timezoneOffset>=0?"-":"+";var absOffset=Math.abs(timezoneOffset);var hours=String(Math.floor(absOffset/60)).padStart(2,"0");var minutes=String(absOffset%60).padStart(2,"0");return`UTC${sign}${hours}${minutes}`};var winterName=extractZone(winterOffset);var summerName=extractZone(summerOffset);if(summerOffset<winterOffset){stringToUTF8(winterName,std_name,17);stringToUTF8(summerName,dst_name,17)}else{stringToUTF8(winterName,dst_name,17);stringToUTF8(summerName,std_name,17)}};var _emscripten_get_now=()=>performance.timeOrigin+performance.now();var _emscripten_date_now=()=>Date.now();var nowIsMonotonic=1;var checkWasiClock=clock_id=>clock_id>=0&&clock_id<=3;function _clock_time_get(clk_id,ignored_precision,ptime){ignored_precision=bigintToI53Checked(ignored_precision);ptime=bigintToI53Checked(ptime);if(!checkWasiClock(clk_id)){return 28}var now;if(clk_id===0){now=_emscripten_date_now()}else if(nowIsMonotonic){now=_emscripten_get_now()}else{return 52}var nsec=Math.round(now*1e3*1e3);(growMemViews(),HEAP64)[ptime/8]=BigInt(nsec);return 0}var _emscripten_check_blocking_allowed=()=>{};var runtimeKeepalivePush=()=>{runtimeKeepaliveCounter+=1};var _emscripten_exit_with_live_runtime=()=>{runtimeKeepalivePush();throw"unwind"};var jsStackTrace=()=>(new Error).stack.toString();var getCallstack=flags=>{var callstack=jsStackTrace();var lines=callstack.split("\\n");callstack="";var firefoxRe=new RegExp("\\\\s*(.*?)@(.*?):([0-9]+):([0-9]+)");var chromeRe=new RegExp("\\\\s*at (.*?) \\\\((.*):(.*):(.*)\\\\)");for(var line of lines){var symbolName="";var file="";var lineno=0;var column=0;var parts=chromeRe.exec(line);if(parts?.length==5){symbolName=parts[1];file=parts[2];lineno=parts[3];column=parts[4]}else{parts=firefoxRe.exec(line);if(parts?.length>=4){symbolName=parts[1];file=parts[2];lineno=parts[3];column=parts[4]|0}else{callstack+=line+"\\n";continue}}if(symbolName=="_emscripten_log"||symbolName=="_emscripten_get_callstack"){callstack="";continue}if(flags&24){if(flags&64){file=file.substring(file.replace(/\\\\/g,"/").lastIndexOf("/")+1)}callstack+=`    at ${symbolName} (${file}:${lineno}:${column})\\n`}}callstack=callstack.replace(/\\s+$/,"");return callstack};function _emscripten_get_callstack(flags,str,maxbytes){str=bigintToI53Checked(str);var callstack=getCallstack(flags);if(!str||maxbytes<=0){return lengthBytesUTF8(callstack)+1}var bytesWrittenExcludingNull=stringToUTF8(callstack,str,maxbytes);return bytesWrittenExcludingNull+1}var getHeapMax=()=>4294967296;var _emscripten_get_heap_max=()=>BigInt(getHeapMax());var _emscripten_has_asyncify=()=>2;var _emscripten_num_logical_cores=()=>ENVIRONMENT_IS_NODE?require("os").cpus().length:navigator["hardwareConcurrency"];var growMemory=size=>{var oldHeapSize=wasmMemory.buffer.byteLength;var pages=(size-oldHeapSize+65535)/65536|0;try{wasmMemory.grow(BigInt(pages));updateMemoryViews();return 1}catch(e){}};function _emscripten_resize_heap(requestedSize){requestedSize=bigintToI53Checked(requestedSize);var oldSize=(growMemViews(),HEAPU8).length;if(requestedSize<=oldSize){return false}var maxHeapSize=getHeapMax();if(requestedSize>maxHeapSize){return false}for(var cutDown=1;cutDown<=4;cutDown*=2){var overGrownHeapSize=oldSize*(1+.2/cutDown);overGrownHeapSize=Math.min(overGrownHeapSize,requestedSize+100663296);var newSize=Math.min(maxHeapSize,alignMemory(Math.max(requestedSize,overGrownHeapSize),65536));var replacement=growMemory(newSize);if(replacement){return true}}return false}var stringToUTF8OnStack=str=>{var size=lengthBytesUTF8(str)+1;var ret=stackAlloc(size);stringToUTF8(str,ret,size);return ret};var writeI53ToI64=(ptr,num)=>{(growMemViews(),HEAPU32)[ptr/4]=num;var lower=(growMemViews(),HEAPU32)[ptr/4];(growMemViews(),HEAPU32)[(ptr+4)/4]=(num-lower)/4294967296};var stringToNewUTF8=str=>{var size=lengthBytesUTF8(str)+1;var ret=_malloc(size);if(ret)stringToUTF8(str,ret,size);return ret};var readI53FromI64=ptr=>(growMemViews(),HEAPU32)[ptr/4]+(growMemViews(),HEAP32)[(ptr+4)/4]*4294967296;var WebGPU={Internals:{jsObjects:[],jsObjectInsert:(ptr,jsObject)=>{WebGPU.Internals.jsObjects[ptr]=jsObject},bufferOnUnmaps:[],futures:[],futureInsert:(futureId,promise)=>{WebGPU.Internals.futures[futureId]=new Promise(resolve=>promise.finally(()=>resolve(futureId)))}},getJsObject:ptr=>{if(!ptr)return undefined;return WebGPU.Internals.jsObjects[ptr]},importJsAdapter:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateAdapter(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsBindGroup:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateBindGroup(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsBindGroupLayout:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateBindGroupLayout(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsBuffer:(buffer,parentPtr=0)=>{assert(buffer.mapState==="unmapped");var bufferPtr=_emwgpuCreateBuffer(parentPtr);WebGPU.Internals.jsObjectInsert(bufferPtr,buffer);return bufferPtr},importJsCommandBuffer:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateCommandBuffer(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsCommandEncoder:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateCommandEncoder(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsComputePassEncoder:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateComputePassEncoder(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsComputePipeline:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateComputePipeline(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsDevice:(device,parentPtr=0)=>{var queuePtr=_emwgpuCreateQueue(parentPtr);var devicePtr=_emwgpuCreateDevice(parentPtr,queuePtr);WebGPU.Internals.jsObjectInsert(queuePtr,device.queue);WebGPU.Internals.jsObjectInsert(devicePtr,device);return devicePtr},importJsExternalTexture:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateExternalTexture(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsPipelineLayout:(obj,parentPtr=0)=>{var ptr=_emwgpuCreatePipelineLayout(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsQuerySet:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateQuerySet(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsQueue:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateQueue(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsRenderBundle:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateRenderBundle(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsRenderBundleEncoder:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateRenderBundleEncoder(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsRenderPassEncoder:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateRenderPassEncoder(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsRenderPipeline:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateRenderPipeline(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsSampler:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateSampler(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsShaderModule:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateShaderModule(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsSurface:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateSurface(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsTexture:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateTexture(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},importJsTextureView:(obj,parentPtr=0)=>{var ptr=_emwgpuCreateTextureView(parentPtr);WebGPU.Internals.jsObjects[ptr]=obj;return ptr},errorCallback:(callback,type,message,userdata)=>{var sp=stackSave();var messagePtr=stringToUTF8OnStack(message);((a1,a2,a3)=>getWasmTableEntry(callback).call(null,a1,BigInt(a2),BigInt(a3)))(type,BigInt(messagePtr),userdata);stackRestore(sp)},iterateExtensions:(root,handlers)=>{for(var ptr=Number((growMemViews(),HEAPU64)[root/8]);ptr;ptr=Number((growMemViews(),HEAPU64)[ptr/8])){var sType=(growMemViews(),HEAP32)[(ptr+8)/4];var handler=handlers[sType](ptr)}},setStringView:(ptr,data,length)=>{(growMemViews(),HEAPU64)[ptr/8]=BigInt(data);(growMemViews(),HEAPU64)[(ptr+8)/8]=BigInt(length)},makeStringFromStringView:stringViewPtr=>{var ptr=Number((growMemViews(),HEAPU64)[stringViewPtr/8]);var length=Number((growMemViews(),HEAPU64)[(stringViewPtr+8)/8]);return UTF8ToString(ptr,length)},makeStringFromOptionalStringView:stringViewPtr=>{var ptr=Number((growMemViews(),HEAPU64)[stringViewPtr/8]);var length=Number((growMemViews(),HEAPU64)[(stringViewPtr+8)/8]);if(!ptr){if(length===0){return""}return undefined}return UTF8ToString(ptr,length)},makeColor:ptr=>({r:(growMemViews(),HEAPF64)[ptr/8],g:(growMemViews(),HEAPF64)[(ptr+8)/8],b:(growMemViews(),HEAPF64)[(ptr+16)/8],a:(growMemViews(),HEAPF64)[(ptr+24)/8]}),makeExtent3D:ptr=>({width:(growMemViews(),HEAPU32)[ptr/4],height:(growMemViews(),HEAPU32)[(ptr+4)/4],depthOrArrayLayers:(growMemViews(),HEAPU32)[(ptr+8)/4]}),makeOrigin3D:ptr=>({x:(growMemViews(),HEAPU32)[ptr/4],y:(growMemViews(),HEAPU32)[(ptr+4)/4],z:(growMemViews(),HEAPU32)[(ptr+8)/4]}),makeTexelCopyTextureInfo:ptr=>({texture:WebGPU.getJsObject(Number((growMemViews(),HEAPU64)[ptr/8])),mipLevel:(growMemViews(),HEAPU32)[(ptr+8)/4],origin:WebGPU.makeOrigin3D(ptr+12),aspect:WebGPU.TextureAspect[(growMemViews(),HEAP32)[(ptr+24)/4]]}),makeTexelCopyBufferLayout:ptr=>{var bytesPerRow=(growMemViews(),HEAPU32)[(ptr+8)/4];var rowsPerImage=(growMemViews(),HEAPU32)[(ptr+12)/4];return{offset:readI53FromI64(ptr),bytesPerRow:bytesPerRow===4294967295?undefined:bytesPerRow,rowsPerImage:rowsPerImage===4294967295?undefined:rowsPerImage}},makeTexelCopyBufferInfo:ptr=>{var layoutPtr=ptr+0;var bufferCopyView=WebGPU.makeTexelCopyBufferLayout(layoutPtr);bufferCopyView["buffer"]=WebGPU.getJsObject(Number((growMemViews(),HEAPU64)[(ptr+16)/8]));return bufferCopyView},makePassTimestampWrites:ptr=>{if(ptr===0)return undefined;return{querySet:WebGPU.getJsObject(Number((growMemViews(),HEAPU64)[(ptr+8)/8])),beginningOfPassWriteIndex:(growMemViews(),HEAPU32)[(ptr+16)/4],endOfPassWriteIndex:(growMemViews(),HEAPU32)[(ptr+20)/4]}},makePipelineConstants:(constantCount,constantsPtr)=>{if(!constantCount)return;var constants={};for(var i=0;i<constantCount;++i){var entryPtr=constantsPtr+32*i;var key=WebGPU.makeStringFromStringView(entryPtr+8);constants[key]=(growMemViews(),HEAPF64)[(entryPtr+24)/8]}return constants},makePipelineLayout:layoutPtr=>{if(!layoutPtr)return"auto";return WebGPU.getJsObject(layoutPtr)},makeComputeState:ptr=>{if(!ptr)return undefined;var desc={module:WebGPU.getJsObject(Number((growMemViews(),HEAPU64)[(ptr+8)/8])),constants:WebGPU.makePipelineConstants(Number((growMemViews(),HEAPU64)[(ptr+32)/8]),Number((growMemViews(),HEAPU64)[(ptr+40)/8])),entryPoint:WebGPU.makeStringFromOptionalStringView(ptr+16)};return desc},makeComputePipelineDesc:descriptor=>{var desc={label:WebGPU.makeStringFromOptionalStringView(descriptor+8),layout:WebGPU.makePipelineLayout(Number((growMemViews(),HEAPU64)[(descriptor+24)/8])),compute:WebGPU.makeComputeState(descriptor+32)};return desc},makeRenderPipelineDesc:descriptor=>{function makePrimitiveState(psPtr){if(!psPtr)return undefined;return{topology:WebGPU.PrimitiveTopology[(growMemViews(),HEAP32)[(psPtr+8)/4]],stripIndexFormat:WebGPU.IndexFormat[(growMemViews(),HEAP32)[(psPtr+12)/4]],frontFace:WebGPU.FrontFace[(growMemViews(),HEAP32)[(psPtr+16)/4]],cullMode:WebGPU.CullMode[(growMemViews(),HEAP32)[(psPtr+20)/4]],unclippedDepth:!!(growMemViews(),HEAPU32)[(psPtr+24)/4]}}function makeBlendComponent(bdPtr){if(!bdPtr)return undefined;return{operation:WebGPU.BlendOperation[(growMemViews(),HEAP32)[bdPtr/4]],srcFactor:WebGPU.BlendFactor[(growMemViews(),HEAP32)[(bdPtr+4)/4]],dstFactor:WebGPU.BlendFactor[(growMemViews(),HEAP32)[(bdPtr+8)/4]]}}function makeBlendState(bsPtr){if(!bsPtr)return undefined;return{alpha:makeBlendComponent(bsPtr+12),color:makeBlendComponent(bsPtr+0)}}function makeColorState(csPtr){var format=WebGPU.TextureFormat[(growMemViews(),HEAP32)[(csPtr+8)/4]];return format?{format,blend:makeBlendState(Number((growMemViews(),HEAPU64)[(csPtr+16)/8])),writeMask:(growMemViews(),HEAPU32)[(csPtr+24)/4]}:undefined}function makeColorStates(count,csArrayPtr){var states=[];for(var i=0;i<count;++i){states.push(makeColorState(csArrayPtr+32*i))}return states}function makeStencilStateFace(ssfPtr){return{compare:WebGPU.CompareFunction[(growMemViews(),HEAP32)[ssfPtr/4]],failOp:WebGPU.StencilOperation[(growMemViews(),HEAP32)[(ssfPtr+4)/4]],depthFailOp:WebGPU.StencilOperation[(growMemViews(),HEAP32)[(ssfPtr+8)/4]],passOp:WebGPU.StencilOperation[(growMemViews(),HEAP32)[(ssfPtr+12)/4]]}}function makeDepthStencilState(dssPtr){if(!dssPtr)return undefined;return{format:WebGPU.TextureFormat[(growMemViews(),HEAP32)[(dssPtr+8)/4]],depthWriteEnabled:!!(growMemViews(),HEAPU32)[(dssPtr+12)/4],depthCompare:WebGPU.CompareFunction[(growMemViews(),HEAP32)[(dssPtr+16)/4]],stencilFront:makeStencilStateFace(dssPtr+20),stencilBack:makeStencilStateFace(dssPtr+36),stencilReadMask:(growMemViews(),HEAPU32)[(dssPtr+52)/4],stencilWriteMask:(growMemViews(),HEAPU32)[(dssPtr+56)/4],depthBias:(growMemViews(),HEAP32)[(dssPtr+60)/4],depthBiasSlopeScale:(growMemViews(),HEAPF32)[(dssPtr+64)/4],depthBiasClamp:(growMemViews(),HEAPF32)[(dssPtr+68)/4]}}function makeVertexAttribute(vaPtr){return{format:WebGPU.VertexFormat[(growMemViews(),HEAP32)[(vaPtr+8)/4]],offset:readI53FromI64(vaPtr+16),shaderLocation:(growMemViews(),HEAPU32)[(vaPtr+24)/4]}}function makeVertexAttributes(count,vaArrayPtr){var vas=[];for(var i=0;i<count;++i){vas.push(makeVertexAttribute(vaArrayPtr+i*32))}return vas}function makeVertexBuffer(vbPtr){if(!vbPtr)return undefined;var stepMode=WebGPU.VertexStepMode[(growMemViews(),HEAP32)[(vbPtr+8)/4]];var attributeCount=Number((growMemViews(),HEAPU64)[(vbPtr+24)/8]);if(!stepMode&&!attributeCount){return null}return{arrayStride:readI53FromI64(vbPtr+16),stepMode,attributes:makeVertexAttributes(attributeCount,Number((growMemViews(),HEAPU64)[(vbPtr+32)/8]))}}function makeVertexBuffers(count,vbArrayPtr){if(!count)return undefined;var vbs=[];for(var i=0;i<count;++i){vbs.push(makeVertexBuffer(vbArrayPtr+i*40))}return vbs}function makeVertexState(viPtr){if(!viPtr)return undefined;var desc={module:WebGPU.getJsObject(Number((growMemViews(),HEAPU64)[(viPtr+8)/8])),constants:WebGPU.makePipelineConstants(Number((growMemViews(),HEAPU64)[(viPtr+32)/8]),Number((growMemViews(),HEAPU64)[(viPtr+40)/8])),buffers:makeVertexBuffers(Number((growMemViews(),HEAPU64)[(viPtr+48)/8]),Number((growMemViews(),HEAPU64)[(viPtr+56)/8])),entryPoint:WebGPU.makeStringFromOptionalStringView(viPtr+16)};return desc}function makeMultisampleState(msPtr){if(!msPtr)return undefined;return{count:(growMemViews(),HEAPU32)[(msPtr+8)/4],mask:(growMemViews(),HEAPU32)[(msPtr+12)/4],alphaToCoverageEnabled:!!(growMemViews(),HEAPU32)[(msPtr+16)/4]}}function makeFragmentState(fsPtr){if(!fsPtr)return undefined;var desc={module:WebGPU.getJsObject(Number((growMemViews(),HEAPU64)[(fsPtr+8)/8])),constants:WebGPU.makePipelineConstants(Number((growMemViews(),HEAPU64)[(fsPtr+32)/8]),Number((growMemViews(),HEAPU64)[(fsPtr+40)/8])),targets:makeColorStates(Number((growMemViews(),HEAPU64)[(fsPtr+48)/8]),Number((growMemViews(),HEAPU64)[(fsPtr+56)/8])),entryPoint:WebGPU.makeStringFromOptionalStringView(fsPtr+16)};return desc}var desc={label:WebGPU.makeStringFromOptionalStringView(descriptor+8),layout:WebGPU.makePipelineLayout(Number((growMemViews(),HEAPU64)[(descriptor+24)/8])),vertex:makeVertexState(descriptor+32),primitive:makePrimitiveState(descriptor+96),depthStencil:makeDepthStencilState(Number((growMemViews(),HEAPU64)[(descriptor+128)/8])),multisample:makeMultisampleState(descriptor+136),fragment:makeFragmentState(Number((growMemViews(),HEAPU64)[(descriptor+160)/8]))};return desc},fillLimitStruct:(limits,limitsOutPtr)=>{var nextInChainPtr=Number((growMemViews(),HEAPU64)[limitsOutPtr/8]);function setLimitValueU32(name,basePtr,limitOffset,fallbackValue=0){var limitValue=limits[name]??fallbackValue;(growMemViews(),HEAPU32)[(basePtr+limitOffset)/4]=limitValue}function setLimitValueU64(name,basePtr,limitOffset,fallbackValue=0){var limitValue=limits[name]??fallbackValue;writeI53ToI64(basePtr+limitOffset,limitValue)}setLimitValueU32("maxTextureDimension1D",limitsOutPtr,8);setLimitValueU32("maxTextureDimension2D",limitsOutPtr,12);setLimitValueU32("maxTextureDimension3D",limitsOutPtr,16);setLimitValueU32("maxTextureArrayLayers",limitsOutPtr,20);setLimitValueU32("maxBindGroups",limitsOutPtr,24);setLimitValueU32("maxBindGroupsPlusVertexBuffers",limitsOutPtr,28);setLimitValueU32("maxBindingsPerBindGroup",limitsOutPtr,32);setLimitValueU32("maxDynamicUniformBuffersPerPipelineLayout",limitsOutPtr,36);setLimitValueU32("maxDynamicStorageBuffersPerPipelineLayout",limitsOutPtr,40);setLimitValueU32("maxSampledTexturesPerShaderStage",limitsOutPtr,44);setLimitValueU32("maxSamplersPerShaderStage",limitsOutPtr,48);setLimitValueU32("maxStorageBuffersPerShaderStage",limitsOutPtr,52);setLimitValueU32("maxStorageTexturesPerShaderStage",limitsOutPtr,56);setLimitValueU32("maxUniformBuffersPerShaderStage",limitsOutPtr,60);setLimitValueU32("minUniformBufferOffsetAlignment",limitsOutPtr,80);setLimitValueU32("minStorageBufferOffsetAlignment",limitsOutPtr,84);setLimitValueU64("maxUniformBufferBindingSize",limitsOutPtr,64);setLimitValueU64("maxStorageBufferBindingSize",limitsOutPtr,72);setLimitValueU32("maxVertexBuffers",limitsOutPtr,88);setLimitValueU64("maxBufferSize",limitsOutPtr,96);setLimitValueU32("maxVertexAttributes",limitsOutPtr,104);setLimitValueU32("maxVertexBufferArrayStride",limitsOutPtr,108);setLimitValueU32("maxInterStageShaderVariables",limitsOutPtr,112);setLimitValueU32("maxColorAttachments",limitsOutPtr,116);setLimitValueU32("maxColorAttachmentBytesPerSample",limitsOutPtr,120);setLimitValueU32("maxComputeWorkgroupStorageSize",limitsOutPtr,124);setLimitValueU32("maxComputeInvocationsPerWorkgroup",limitsOutPtr,128);setLimitValueU32("maxComputeWorkgroupSizeX",limitsOutPtr,132);setLimitValueU32("maxComputeWorkgroupSizeY",limitsOutPtr,136);setLimitValueU32("maxComputeWorkgroupSizeZ",limitsOutPtr,140);setLimitValueU32("maxComputeWorkgroupsPerDimension",limitsOutPtr,144);setLimitValueU32("maxImmediateSize",limitsOutPtr,148);if(nextInChainPtr!==0){var sType=(growMemViews(),HEAP32)[(nextInChainPtr+8)/4];var compatibilityModeLimitsPtr=nextInChainPtr;setLimitValueU32("maxStorageBuffersInVertexStage",compatibilityModeLimitsPtr,16,limits.maxStorageBuffersPerShaderStage);setLimitValueU32("maxStorageBuffersInFragmentStage",compatibilityModeLimitsPtr,24,limits.maxStorageBuffersPerShaderStage);setLimitValueU32("maxStorageTexturesInVertexStage",compatibilityModeLimitsPtr,20,limits.maxStorageTexturesPerShaderStage);setLimitValueU32("maxStorageTexturesInFragmentStage",compatibilityModeLimitsPtr,28,limits.maxStorageTexturesPerShaderStage)}},fillAdapterInfoStruct:(info,infoStruct)=>{(growMemViews(),HEAPU32)[(infoStruct+88)/4]=info.subgroupMinSize;(growMemViews(),HEAPU32)[(infoStruct+92)/4]=info.subgroupMaxSize;var strs=info.vendor+info.architecture+info.device+info.description;var strPtr=stringToNewUTF8(strs);var vendorLen=lengthBytesUTF8(info.vendor);WebGPU.setStringView(infoStruct+8,strPtr,vendorLen);strPtr+=vendorLen;var architectureLen=lengthBytesUTF8(info.architecture);WebGPU.setStringView(infoStruct+24,strPtr,architectureLen);strPtr+=architectureLen;var deviceLen=lengthBytesUTF8(info.device);WebGPU.setStringView(infoStruct+40,strPtr,deviceLen);strPtr+=deviceLen;var descriptionLen=lengthBytesUTF8(info.description);WebGPU.setStringView(infoStruct+56,strPtr,descriptionLen);strPtr+=descriptionLen;(growMemViews(),HEAP32)[(infoStruct+72)/4]=2;var adapterType=info.isFallbackAdapter?3:4;(growMemViews(),HEAP32)[(infoStruct+76)/4]=adapterType;(growMemViews(),HEAPU32)[(infoStruct+80)/4]=0;(growMemViews(),HEAPU32)[(infoStruct+84)/4]=0},AddressMode:[,"clamp-to-edge","repeat","mirror-repeat"],BlendFactor:[,"zero","one","src","one-minus-src","src-alpha","one-minus-src-alpha","dst","one-minus-dst","dst-alpha","one-minus-dst-alpha","src-alpha-saturated","constant","one-minus-constant","src1","one-minus-src1","src1-alpha","one-minus-src1-alpha"],BlendOperation:[,"add","subtract","reverse-subtract","min","max"],BufferBindingType:[,,"uniform","storage","read-only-storage"],BufferMapState:[,"unmapped","pending","mapped"],CompareFunction:[,"never","less","equal","less-equal","greater","not-equal","greater-equal","always"],CompilationInfoRequestStatus:[,"success","callback-cancelled"],ComponentSwizzle:[,"0","1","r","g","b","a"],CompositeAlphaMode:[,"opaque","premultiplied","unpremultiplied","inherit"],CullMode:[,"none","front","back"],ErrorFilter:[,"validation","out-of-memory","internal"],FeatureLevel:[,"compatibility","core"],FeatureName:{1:"core-features-and-limits",2:"depth-clip-control",3:"depth32float-stencil8",4:"texture-compression-bc",5:"texture-compression-bc-sliced-3d",6:"texture-compression-etc2",7:"texture-compression-astc",8:"texture-compression-astc-sliced-3d",9:"timestamp-query",10:"indirect-first-instance",11:"shader-f16",12:"rg11b10ufloat-renderable",13:"bgra8unorm-storage",14:"float32-filterable",15:"float32-blendable",16:"clip-distances",17:"dual-source-blending",18:"subgroups",19:"texture-formats-tier1",20:"texture-formats-tier2",21:"primitive-index",22:"texture-component-swizzle",327692:"chromium-experimental-unorm16-texture-formats",327729:"chromium-experimental-multi-draw-indirect"},FilterMode:[,"nearest","linear"],FrontFace:[,"ccw","cw"],IndexFormat:[,"uint16","uint32"],InstanceFeatureName:[,"timed-wait-any","shader-source-spirv","multiple-devices-per-adapter"],LoadOp:[,"load","clear"],MipmapFilterMode:[,"nearest","linear"],OptionalBool:["false","true"],PowerPreference:[,"low-power","high-performance"],PredefinedColorSpace:[,"srgb","display-p3"],PrimitiveTopology:[,"point-list","line-list","line-strip","triangle-list","triangle-strip"],QueryType:[,"occlusion","timestamp"],SamplerBindingType:[,,"filtering","non-filtering","comparison"],Status:[,"success","error"],StencilOperation:[,"keep","zero","replace","invert","increment-clamp","decrement-clamp","increment-wrap","decrement-wrap"],StorageTextureAccess:[,,"write-only","read-only","read-write"],StoreOp:[,"store","discard"],SurfaceGetCurrentTextureStatus:[,"success-optimal","success-suboptimal","timeout","outdated","lost","error"],TextureAspect:[,"all","stencil-only","depth-only"],TextureDimension:[,"1d","2d","3d"],TextureFormat:[,"r8unorm","r8snorm","r8uint","r8sint","r16unorm","r16snorm","r16uint","r16sint","r16float","rg8unorm","rg8snorm","rg8uint","rg8sint","r32float","r32uint","r32sint","rg16unorm","rg16snorm","rg16uint","rg16sint","rg16float","rgba8unorm","rgba8unorm-srgb","rgba8snorm","rgba8uint","rgba8sint","bgra8unorm","bgra8unorm-srgb","rgb10a2uint","rgb10a2unorm","rg11b10ufloat","rgb9e5ufloat","rg32float","rg32uint","rg32sint","rgba16unorm","rgba16snorm","rgba16uint","rgba16sint","rgba16float","rgba32float","rgba32uint","rgba32sint","stencil8","depth16unorm","depth24plus","depth24plus-stencil8","depth32float","depth32float-stencil8","bc1-rgba-unorm","bc1-rgba-unorm-srgb","bc2-rgba-unorm","bc2-rgba-unorm-srgb","bc3-rgba-unorm","bc3-rgba-unorm-srgb","bc4-r-unorm","bc4-r-snorm","bc5-rg-unorm","bc5-rg-snorm","bc6h-rgb-ufloat","bc6h-rgb-float","bc7-rgba-unorm","bc7-rgba-unorm-srgb","etc2-rgb8unorm","etc2-rgb8unorm-srgb","etc2-rgb8a1unorm","etc2-rgb8a1unorm-srgb","etc2-rgba8unorm","etc2-rgba8unorm-srgb","eac-r11unorm","eac-r11snorm","eac-rg11unorm","eac-rg11snorm","astc-4x4-unorm","astc-4x4-unorm-srgb","astc-5x4-unorm","astc-5x4-unorm-srgb","astc-5x5-unorm","astc-5x5-unorm-srgb","astc-6x5-unorm","astc-6x5-unorm-srgb","astc-6x6-unorm","astc-6x6-unorm-srgb","astc-8x5-unorm","astc-8x5-unorm-srgb","astc-8x6-unorm","astc-8x6-unorm-srgb","astc-8x8-unorm","astc-8x8-unorm-srgb","astc-10x5-unorm","astc-10x5-unorm-srgb","astc-10x6-unorm","astc-10x6-unorm-srgb","astc-10x8-unorm","astc-10x8-unorm-srgb","astc-10x10-unorm","astc-10x10-unorm-srgb","astc-12x10-unorm","astc-12x10-unorm-srgb","astc-12x12-unorm","astc-12x12-unorm-srgb"],TextureSampleType:[,,"float","unfilterable-float","depth","sint","uint"],TextureViewDimension:[,"1d","2d","2d-array","cube","cube-array","3d"],ToneMappingMode:[,"standard","extended"],VertexFormat:[,"uint8","uint8x2","uint8x4","sint8","sint8x2","sint8x4","unorm8","unorm8x2","unorm8x4","snorm8","snorm8x2","snorm8x4","uint16","uint16x2","uint16x4","sint16","sint16x2","sint16x4","unorm16","unorm16x2","unorm16x4","snorm16","snorm16x2","snorm16x4","float16","float16x2","float16x4","float32","float32x2","float32x3","float32x4","uint32","uint32x2","uint32x3","uint32x4","sint32","sint32x2","sint32x3","sint32x4","unorm10-10-10-2","unorm8x4-bgra"],VertexStepMode:[,"vertex","instance"],WGSLLanguageFeatureName:[,"readonly_and_readwrite_storage_textures","packed_4x8_integer_dot_product","unrestricted_pointer_parameters","pointer_composite_access","uniform_buffer_standard_layout","subgroup_id","texture_and_sampler_let","subgroup_uniformity","texture_formats_tier1"]};var emwgpuStringToInt_DeviceLostReason={undefined:1,unknown:1,destroyed:2};var runtimeKeepalivePop=()=>{runtimeKeepaliveCounter-=1};function _emwgpuAdapterRequestDevice(adapterPtr,futureId,deviceLostFutureId,devicePtr,queuePtr,descriptor){adapterPtr=bigintToI53Checked(adapterPtr);futureId=bigintToI53Checked(futureId);deviceLostFutureId=bigintToI53Checked(deviceLostFutureId);devicePtr=bigintToI53Checked(devicePtr);queuePtr=bigintToI53Checked(queuePtr);descriptor=bigintToI53Checked(descriptor);var adapter=WebGPU.getJsObject(adapterPtr);var desc={};if(descriptor){var requiredFeatureCount=Number((growMemViews(),HEAPU64)[(descriptor+24)/8]);if(requiredFeatureCount){var requiredFeaturesPtr=Number((growMemViews(),HEAPU64)[(descriptor+32)/8]);desc["requiredFeatures"]=Array.from((growMemViews(),HEAPU32).subarray(requiredFeaturesPtr/4,(requiredFeaturesPtr+requiredFeatureCount*4)/4),feature=>WebGPU.FeatureName[feature])}var limitsPtr=Number((growMemViews(),HEAPU64)[(descriptor+40)/8]);if(limitsPtr){var nextInChainPtr=Number((growMemViews(),HEAPU64)[limitsPtr/8]);var requiredLimits={};function setLimitU32IfDefined(name,basePtr,limitOffset,ignoreIfZero=false){var ptr=basePtr+limitOffset;var value=(growMemViews(),HEAPU32)[ptr/4];if(value!=4294967295&&(!ignoreIfZero||value!=0)){requiredLimits[name]=value}}function setLimitU64IfDefined(name,basePtr,limitOffset){var ptr=basePtr+limitOffset;var limitPart1=(growMemViews(),HEAPU32)[ptr/4];var limitPart2=(growMemViews(),HEAPU32)[(ptr+4)/4];if(limitPart1!=4294967295||limitPart2!=4294967295){requiredLimits[name]=readI53FromI64(ptr)}}setLimitU32IfDefined("maxTextureDimension1D",limitsPtr,8);setLimitU32IfDefined("maxTextureDimension2D",limitsPtr,12);setLimitU32IfDefined("maxTextureDimension3D",limitsPtr,16);setLimitU32IfDefined("maxTextureArrayLayers",limitsPtr,20);setLimitU32IfDefined("maxBindGroups",limitsPtr,24);setLimitU32IfDefined("maxBindGroupsPlusVertexBuffers",limitsPtr,28);setLimitU32IfDefined("maxBindingsPerBindGroup",limitsPtr,32);setLimitU32IfDefined("maxDynamicUniformBuffersPerPipelineLayout",limitsPtr,36);setLimitU32IfDefined("maxDynamicStorageBuffersPerPipelineLayout",limitsPtr,40);setLimitU32IfDefined("maxSampledTexturesPerShaderStage",limitsPtr,44);setLimitU32IfDefined("maxSamplersPerShaderStage",limitsPtr,48);setLimitU32IfDefined("maxStorageBuffersPerShaderStage",limitsPtr,52);setLimitU32IfDefined("maxStorageTexturesPerShaderStage",limitsPtr,56);setLimitU32IfDefined("maxUniformBuffersPerShaderStage",limitsPtr,60);setLimitU32IfDefined("minUniformBufferOffsetAlignment",limitsPtr,80);setLimitU32IfDefined("minStorageBufferOffsetAlignment",limitsPtr,84);setLimitU64IfDefined("maxUniformBufferBindingSize",limitsPtr,64);setLimitU64IfDefined("maxStorageBufferBindingSize",limitsPtr,72);setLimitU32IfDefined("maxVertexBuffers",limitsPtr,88);setLimitU64IfDefined("maxBufferSize",limitsPtr,96);setLimitU32IfDefined("maxVertexAttributes",limitsPtr,104);setLimitU32IfDefined("maxVertexBufferArrayStride",limitsPtr,108);setLimitU32IfDefined("maxInterStageShaderVariables",limitsPtr,112);setLimitU32IfDefined("maxColorAttachments",limitsPtr,116);setLimitU32IfDefined("maxColorAttachmentBytesPerSample",limitsPtr,120);setLimitU32IfDefined("maxComputeWorkgroupStorageSize",limitsPtr,124);setLimitU32IfDefined("maxComputeInvocationsPerWorkgroup",limitsPtr,128);setLimitU32IfDefined("maxComputeWorkgroupSizeX",limitsPtr,132);setLimitU32IfDefined("maxComputeWorkgroupSizeY",limitsPtr,136);setLimitU32IfDefined("maxComputeWorkgroupSizeZ",limitsPtr,140);setLimitU32IfDefined("maxComputeWorkgroupsPerDimension",limitsPtr,144);setLimitU32IfDefined("maxImmediateSize",limitsPtr,148,true);if(nextInChainPtr!==0){var sType=(growMemViews(),HEAP32)[(nextInChainPtr+8)/4];var compatibilityModeLimitsPtr=nextInChainPtr;if("maxStorageBuffersInVertexStage"in GPUSupportedLimits.prototype){setLimitU32IfDefined("maxStorageBuffersInVertexStage",compatibilityModeLimitsPtr,16);setLimitU32IfDefined("maxStorageTexturesInVertexStage",compatibilityModeLimitsPtr,20);setLimitU32IfDefined("maxStorageBuffersInFragmentStage",compatibilityModeLimitsPtr,24);setLimitU32IfDefined("maxStorageTexturesInFragmentStage",compatibilityModeLimitsPtr,28)}}desc["requiredLimits"]=requiredLimits}var defaultQueuePtr=Number((growMemViews(),HEAPU64)[(descriptor+48)/8]);if(defaultQueuePtr){var defaultQueueDesc={label:WebGPU.makeStringFromOptionalStringView(defaultQueuePtr+8)};desc["defaultQueue"]=defaultQueueDesc}desc["label"]=WebGPU.makeStringFromOptionalStringView(descriptor+8)}runtimeKeepalivePush();WebGPU.Internals.futureInsert(futureId,adapter.requestDevice(desc).then(device=>{runtimeKeepalivePop();callUserCallback(()=>{WebGPU.Internals.jsObjectInsert(queuePtr,device.queue);WebGPU.Internals.jsObjectInsert(devicePtr,device);devicePtr=BigInt(devicePtr);WebGPU.Internals.futureInsert(deviceLostFutureId,device.lost.then(info=>{callUserCallback(()=>{device.onuncapturederror=ev=>{};var sp=stackSave();var messagePtr=stringToUTF8OnStack(info.message);_emwgpuOnDeviceLostCompleted(deviceLostFutureId,emwgpuStringToInt_DeviceLostReason[info.reason],BigInt(messagePtr));stackRestore(sp)})}));device.onuncapturederror=ev=>{var type=5;if(ev.error instanceof GPUValidationError)type=2;else if(ev.error instanceof GPUOutOfMemoryError)type=3;else if(ev.error instanceof GPUInternalError)type=4;var sp=stackSave();var messagePtr=stringToUTF8OnStack(ev.error.message);_emwgpuOnUncapturedError(BigInt(devicePtr),type,BigInt(messagePtr));stackRestore(sp)};_emwgpuOnRequestDeviceCompleted(futureId,1,BigInt(devicePtr),0n)})},ex=>{runtimeKeepalivePop();callUserCallback(()=>{var sp=stackSave();var messagePtr=stringToUTF8OnStack(ex.message);_emwgpuOnRequestDeviceCompleted(futureId,3,BigInt(devicePtr),BigInt(messagePtr));if(deviceLostFutureId){_emwgpuOnDeviceLostCompleted(deviceLostFutureId,4,BigInt(messagePtr))}stackRestore(sp)})}))}function _emwgpuBufferDestroy(bufferPtr){bufferPtr=bigintToI53Checked(bufferPtr);var buffer=WebGPU.getJsObject(bufferPtr);var onUnmap=WebGPU.Internals.bufferOnUnmaps[bufferPtr];if(onUnmap){for(var i=0;i<onUnmap.length;++i){onUnmap[i]()}delete WebGPU.Internals.bufferOnUnmaps[bufferPtr]}buffer.destroy()}var warnOnce=text=>{warnOnce.shown||={};if(!warnOnce.shown[text]){warnOnce.shown[text]=1;if(ENVIRONMENT_IS_NODE)text="warning: "+text;err(text)}};var _emwgpuBufferGetConstMappedRange=function(bufferPtr,offset,size){bufferPtr=bigintToI53Checked(bufferPtr);offset=bigintToI53Checked(offset);size=bigintToI53Checked(size);var ret=(()=>{var buffer=WebGPU.getJsObject(bufferPtr);if(size==-1)size=undefined;var mapped;try{mapped=buffer.getMappedRange(offset,size)}catch(ex){return 0n}var data=_memalign(16,mapped.byteLength);(growMemViews(),HEAPU8).set(new Uint8Array(mapped),data);WebGPU.Internals.bufferOnUnmaps[bufferPtr].push(()=>_free(data));return data})();return BigInt(ret)};var _emwgpuBufferMapAsync=function(bufferPtr,futureId,mode,offset,size){bufferPtr=bigintToI53Checked(bufferPtr);futureId=bigintToI53Checked(futureId);mode=bigintToI53Checked(mode);offset=bigintToI53Checked(offset);size=bigintToI53Checked(size);var buffer=WebGPU.getJsObject(bufferPtr);WebGPU.Internals.bufferOnUnmaps[bufferPtr]=[];if(size==-1)size=undefined;runtimeKeepalivePush();WebGPU.Internals.futureInsert(futureId,buffer.mapAsync(mode,offset,size).then(()=>{runtimeKeepalivePop();callUserCallback(()=>{_emwgpuOnMapAsyncCompleted(futureId,1,0n)})},ex=>{runtimeKeepalivePop();callUserCallback(()=>{var sp=stackSave();var messagePtr=stringToUTF8OnStack(ex.message);var status=ex.name==="AbortError"?4:ex.name==="OperationError"?3:0;_emwgpuOnMapAsyncCompleted(futureId,status,BigInt(messagePtr));delete WebGPU.Internals.bufferOnUnmaps[bufferPtr]})}))};function _emwgpuBufferUnmap(bufferPtr){bufferPtr=bigintToI53Checked(bufferPtr);var buffer=WebGPU.getJsObject(bufferPtr);var onUnmap=WebGPU.Internals.bufferOnUnmaps[bufferPtr];if(!onUnmap){return}for(var i=0;i<onUnmap.length;++i){onUnmap[i]()}delete WebGPU.Internals.bufferOnUnmaps[bufferPtr];buffer.unmap()}function _emwgpuDelete(ptr){ptr=bigintToI53Checked(ptr);delete WebGPU.Internals.jsObjects[ptr]}function _emwgpuDeviceCreateBuffer(devicePtr,descriptor,bufferPtr){devicePtr=bigintToI53Checked(devicePtr);descriptor=bigintToI53Checked(descriptor);bufferPtr=bigintToI53Checked(bufferPtr);var mappedAtCreation=!!(growMemViews(),HEAPU32)[(descriptor+40)/4];var desc={label:WebGPU.makeStringFromOptionalStringView(descriptor+8),usage:(growMemViews(),HEAPU32)[(descriptor+24)/4],size:readI53FromI64(descriptor+32),mappedAtCreation};var device=WebGPU.getJsObject(devicePtr);var buffer;try{buffer=device.createBuffer(desc)}catch(ex){return false}WebGPU.Internals.jsObjectInsert(bufferPtr,buffer);if(mappedAtCreation){WebGPU.Internals.bufferOnUnmaps[bufferPtr]=[]}return true}function _emwgpuDeviceCreateShaderModule(devicePtr,descriptor,shaderModulePtr){devicePtr=bigintToI53Checked(devicePtr);descriptor=bigintToI53Checked(descriptor);shaderModulePtr=bigintToI53Checked(shaderModulePtr);var nextInChainPtr=Number((growMemViews(),HEAPU64)[descriptor/8]);var sType=(growMemViews(),HEAP32)[(nextInChainPtr+8)/4];var desc={label:WebGPU.makeStringFromOptionalStringView(descriptor+8),code:""};switch(sType){case 2:{desc["code"]=WebGPU.makeStringFromStringView(nextInChainPtr+16);break}}var device=WebGPU.getJsObject(devicePtr);WebGPU.Internals.jsObjectInsert(shaderModulePtr,device.createShaderModule(desc))}var _emwgpuDeviceDestroy=devicePtr=>{const device=WebGPU.getJsObject(devicePtr);device.onuncapturederror=null;device.destroy()};function _emwgpuInstanceRequestAdapter(instancePtr,futureId,options,adapterPtr){instancePtr=bigintToI53Checked(instancePtr);futureId=bigintToI53Checked(futureId);options=bigintToI53Checked(options);adapterPtr=bigintToI53Checked(adapterPtr);var opts;if(options){opts={featureLevel:WebGPU.FeatureLevel[(growMemViews(),HEAP32)[(options+8)/4]],powerPreference:WebGPU.PowerPreference[(growMemViews(),HEAP32)[(options+12)/4]],forceFallbackAdapter:!!(growMemViews(),HEAPU32)[(options+16)/4]};var nextInChainPtr=Number((growMemViews(),HEAPU64)[options/8]);if(nextInChainPtr!==0){var sType=(growMemViews(),HEAP32)[(nextInChainPtr+8)/4];var webxrOptions=nextInChainPtr;opts.xrCompatible=!!(growMemViews(),HEAPU32)[(webxrOptions+16)/4]}}if(!("gpu"in navigator)){var sp=stackSave();var messagePtr=stringToUTF8OnStack("WebGPU not available on this browser (navigator.gpu is not available)");_emwgpuOnRequestAdapterCompleted(futureId,3,BigInt(adapterPtr),BigInt(messagePtr));stackRestore(sp);return}runtimeKeepalivePush();WebGPU.Internals.futureInsert(futureId,navigator.gpu.requestAdapter(opts).then(adapter=>{runtimeKeepalivePop();callUserCallback(()=>{if(adapter){WebGPU.Internals.jsObjectInsert(adapterPtr,adapter);_emwgpuOnRequestAdapterCompleted(futureId,1,BigInt(adapterPtr),0n)}else{var sp=stackSave();var messagePtr=stringToUTF8OnStack("WebGPU not available on this browser (requestAdapter returned null)");_emwgpuOnRequestAdapterCompleted(futureId,3,BigInt(adapterPtr),BigInt(messagePtr));stackRestore(sp)}})},ex=>{runtimeKeepalivePop();callUserCallback(()=>{var sp=stackSave();var messagePtr=stringToUTF8OnStack(ex.message);_emwgpuOnRequestAdapterCompleted(futureId,4,BigInt(adapterPtr),BigInt(messagePtr));stackRestore(sp)})}))}var _emwgpuQueueOnSubmittedWorkDone=function(queuePtr,futureId){queuePtr=bigintToI53Checked(queuePtr);futureId=bigintToI53Checked(futureId);var queue=WebGPU.getJsObject(queuePtr);runtimeKeepalivePush();WebGPU.Internals.futureInsert(futureId,queue.onSubmittedWorkDone().then(()=>{runtimeKeepalivePop();callUserCallback(()=>{_emwgpuOnWorkDoneCompleted(futureId,1)})}))};var _emwgpuWaitAny=function(futurePtr,futureCount,timeoutMSPtr){futurePtr=bigintToI53Checked(futurePtr);futureCount=bigintToI53Checked(futureCount);timeoutMSPtr=bigintToI53Checked(timeoutMSPtr);return Asyncify.handleAsync(async()=>{var promises=[];if(timeoutMSPtr){var timeoutMS=(growMemViews(),HEAP32)[timeoutMSPtr/4];promises.length=futureCount+1;promises[futureCount]=new Promise(resolve=>setTimeout(resolve,timeoutMS,0))}else{promises.length=futureCount}for(var i=0;i<futureCount;++i){var futureId=readI53FromI64(futurePtr+i*8);if(!(futureId in WebGPU.Internals.futures)){return futureId}promises[i]=WebGPU.Internals.futures[futureId]}const firstResolvedFuture=await Promise.race(promises);delete WebGPU.Internals.futures[firstResolvedFuture];return firstResolvedFuture})};_emwgpuWaitAny.isAsync=true;var ENV={};var getExecutableName=()=>thisProgram||"./this.program";var getEnvStrings=()=>{if(!getEnvStrings.strings){var lang=(typeof navigator=="object"&&navigator.language||"C").replace("-","_")+".UTF-8";var env={USER:"web_user",LOGNAME:"web_user",PATH:"/",PWD:"/",HOME:"/home/web_user",LANG:lang,_:getExecutableName()};for(var x in ENV){if(ENV[x]===undefined)delete env[x];else env[x]=ENV[x]}var strings=[];for(var x in env){strings.push(`${x}=${env[x]}`)}getEnvStrings.strings=strings}return getEnvStrings.strings};function _environ_get(__environ,environ_buf){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(14,0,1,__environ,environ_buf);__environ=bigintToI53Checked(__environ);environ_buf=bigintToI53Checked(environ_buf);var bufSize=0;var envp=0;for(var string of getEnvStrings()){var ptr=environ_buf+bufSize;(growMemViews(),HEAPU64)[(__environ+envp)/8]=BigInt(ptr);bufSize+=stringToUTF8(string,ptr,Infinity)+1;envp+=8}return 0}function _environ_sizes_get(penviron_count,penviron_buf_size){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(15,0,1,penviron_count,penviron_buf_size);penviron_count=bigintToI53Checked(penviron_count);penviron_buf_size=bigintToI53Checked(penviron_buf_size);var strings=getEnvStrings();(growMemViews(),HEAPU64)[penviron_count/8]=BigInt(strings.length);var bufSize=0;for(var string of strings){bufSize+=lengthBytesUTF8(string)+1}(growMemViews(),HEAPU64)[penviron_buf_size/8]=BigInt(bufSize);return 0}function _fd_close(fd){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(16,0,1,fd);try{var stream=SYSCALLS.getStreamFromFD(fd);FS.close(stream);return 0}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return e.errno}}var doReadv=(stream,iov,iovcnt,offset)=>{var ret=0;for(var i=0;i<iovcnt;i++){var ptr=Number((growMemViews(),HEAPU64)[iov/8]);var len=Number((growMemViews(),HEAPU64)[(iov+8)/8]);iov+=16;var curr=FS.read(stream,(growMemViews(),HEAP8),ptr,len,offset);if(curr<0)return-1;ret+=curr;if(curr<len)break;if(typeof offset!="undefined"){offset+=curr}}return ret};function _fd_read(fd,iov,iovcnt,pnum){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(17,0,1,fd,iov,iovcnt,pnum);iov=bigintToI53Checked(iov);iovcnt=bigintToI53Checked(iovcnt);pnum=bigintToI53Checked(pnum);try{var stream=SYSCALLS.getStreamFromFD(fd);var num=doReadv(stream,iov,iovcnt);(growMemViews(),HEAPU64)[pnum/8]=BigInt(num);return 0}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return e.errno}}function _fd_seek(fd,offset,whence,newOffset){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(18,0,1,fd,offset,whence,newOffset);offset=bigintToI53Checked(offset);newOffset=bigintToI53Checked(newOffset);try{if(isNaN(offset))return 61;var stream=SYSCALLS.getStreamFromFD(fd);FS.llseek(stream,offset,whence);(growMemViews(),HEAP64)[newOffset/8]=BigInt(stream.position);if(stream.getdents&&offset===0&&whence===0)stream.getdents=null;return 0}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return e.errno}}var doWritev=(stream,iov,iovcnt,offset)=>{var ret=0;for(var i=0;i<iovcnt;i++){var ptr=Number((growMemViews(),HEAPU64)[iov/8]);var len=Number((growMemViews(),HEAPU64)[(iov+8)/8]);iov+=16;var curr=FS.write(stream,(growMemViews(),HEAP8),ptr,len,offset);if(curr<0)return-1;ret+=curr;if(curr<len){break}if(typeof offset!="undefined"){offset+=curr}}return ret};function _fd_write(fd,iov,iovcnt,pnum){if(ENVIRONMENT_IS_PTHREAD)return proxyToMainThread(19,0,1,fd,iov,iovcnt,pnum);iov=bigintToI53Checked(iov);iovcnt=bigintToI53Checked(iovcnt);pnum=bigintToI53Checked(pnum);try{var stream=SYSCALLS.getStreamFromFD(fd);var num=doWritev(stream,iov,iovcnt);(growMemViews(),HEAPU64)[pnum/8]=BigInt(num);return 0}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return e.errno}}function _random_get(buffer,size){buffer=bigintToI53Checked(buffer);size=bigintToI53Checked(size);try{randomFill((growMemViews(),HEAPU8).subarray(buffer,buffer+size));return 0}catch(e){if(typeof FS=="undefined"||!(e.name==="ErrnoError"))throw e;return e.errno}}function _wgpuAdapterGetInfo(adapterPtr,info){adapterPtr=bigintToI53Checked(adapterPtr);info=bigintToI53Checked(info);var adapter=WebGPU.getJsObject(adapterPtr);WebGPU.fillAdapterInfoStruct(adapter.info,info);return 1}function _wgpuAdapterGetLimits(adapterPtr,limitsOutPtr){adapterPtr=bigintToI53Checked(adapterPtr);limitsOutPtr=bigintToI53Checked(limitsOutPtr);var adapter=WebGPU.getJsObject(adapterPtr);WebGPU.fillLimitStruct(adapter.limits,limitsOutPtr);return 1}function _wgpuAdapterHasFeature(adapterPtr,featureEnumValue){adapterPtr=bigintToI53Checked(adapterPtr);var adapter=WebGPU.getJsObject(adapterPtr);return adapter.features.has(WebGPU.FeatureName[featureEnumValue])}var _wgpuBufferGetSize=function(bufferPtr){bufferPtr=bigintToI53Checked(bufferPtr);var ret=(()=>{var buffer=WebGPU.getJsObject(bufferPtr);return buffer.size})();return BigInt(ret)};var _wgpuCommandEncoderBeginComputePass=function(encoderPtr,descriptor){encoderPtr=bigintToI53Checked(encoderPtr);descriptor=bigintToI53Checked(descriptor);var ret=(()=>{var desc;if(descriptor){desc={label:WebGPU.makeStringFromOptionalStringView(descriptor+8),timestampWrites:WebGPU.makePassTimestampWrites(Number((growMemViews(),HEAPU64)[(descriptor+24)/8]))}}var commandEncoder=WebGPU.getJsObject(encoderPtr);var ptr=_emwgpuCreateComputePassEncoder(0n);WebGPU.Internals.jsObjectInsert(ptr,commandEncoder.beginComputePass(desc));return ptr})();return BigInt(ret)};function _wgpuCommandEncoderCopyBufferToBuffer(encoderPtr,srcPtr,srcOffset,dstPtr,dstOffset,size){encoderPtr=bigintToI53Checked(encoderPtr);srcPtr=bigintToI53Checked(srcPtr);srcOffset=bigintToI53Checked(srcOffset);dstPtr=bigintToI53Checked(dstPtr);dstOffset=bigintToI53Checked(dstOffset);size=bigintToI53Checked(size);var commandEncoder=WebGPU.getJsObject(encoderPtr);var src=WebGPU.getJsObject(srcPtr);var dst=WebGPU.getJsObject(dstPtr);commandEncoder.copyBufferToBuffer(src,srcOffset,dst,dstOffset,size)}var _wgpuCommandEncoderFinish=function(encoderPtr,descriptor){encoderPtr=bigintToI53Checked(encoderPtr);descriptor=bigintToI53Checked(descriptor);var ret=(()=>{var commandEncoder=WebGPU.getJsObject(encoderPtr);var ptr=_emwgpuCreateCommandBuffer(0n);WebGPU.Internals.jsObjectInsert(ptr,commandEncoder.finish());return ptr})();return BigInt(ret)};function _wgpuComputePassEncoderDispatchWorkgroups(passPtr,x,y,z){passPtr=bigintToI53Checked(passPtr);var pass=WebGPU.getJsObject(passPtr);pass.dispatchWorkgroups(x,y,z)}function _wgpuComputePassEncoderEnd(passPtr){passPtr=bigintToI53Checked(passPtr);var pass=WebGPU.getJsObject(passPtr);pass.end()}function _wgpuComputePassEncoderSetBindGroup(passPtr,groupIndex,groupPtr,dynamicOffsetCount,dynamicOffsetsPtr){passPtr=bigintToI53Checked(passPtr);groupPtr=bigintToI53Checked(groupPtr);dynamicOffsetCount=bigintToI53Checked(dynamicOffsetCount);dynamicOffsetsPtr=bigintToI53Checked(dynamicOffsetsPtr);var pass=WebGPU.getJsObject(passPtr);var group=WebGPU.getJsObject(groupPtr);if(dynamicOffsetCount==0){pass.setBindGroup(groupIndex,group)}else{pass.setBindGroup(groupIndex,group,(growMemViews(),HEAPU32),dynamicOffsetsPtr/4,dynamicOffsetCount)}}function _wgpuComputePassEncoderSetPipeline(passPtr,pipelinePtr){passPtr=bigintToI53Checked(passPtr);pipelinePtr=bigintToI53Checked(pipelinePtr);var pass=WebGPU.getJsObject(passPtr);var pipeline=WebGPU.getJsObject(pipelinePtr);pass.setPipeline(pipeline)}var _wgpuComputePipelineGetBindGroupLayout=function(pipelinePtr,groupIndex){pipelinePtr=bigintToI53Checked(pipelinePtr);var ret=(()=>{var pipeline=WebGPU.getJsObject(pipelinePtr);var ptr=_emwgpuCreateBindGroupLayout(0n);WebGPU.Internals.jsObjectInsert(ptr,pipeline.getBindGroupLayout(groupIndex));return ptr})();return BigInt(ret)};var _wgpuDeviceCreateBindGroup=function(devicePtr,descriptor){devicePtr=bigintToI53Checked(devicePtr);descriptor=bigintToI53Checked(descriptor);var ret=(()=>{function makeEntry(entryPtr){var bufferPtr=Number((growMemViews(),HEAPU64)[(entryPtr+16)/8]);var samplerPtr=Number((growMemViews(),HEAPU64)[(entryPtr+40)/8]);var textureViewPtr=Number((growMemViews(),HEAPU64)[(entryPtr+48)/8]);var externalTexturePtr=0;WebGPU.iterateExtensions(entryPtr,{327681:ptr=>{externalTexturePtr=Number((growMemViews(),HEAPU64)[(ptr+16)/8])}});var resource;if(bufferPtr){var size=readI53FromI64(entryPtr+32);if(size==-1)size=undefined;resource={buffer:WebGPU.getJsObject(bufferPtr),offset:readI53FromI64(entryPtr+24),size}}else{resource=WebGPU.getJsObject(samplerPtr||textureViewPtr||externalTexturePtr)}return{binding:(growMemViews(),HEAPU32)[(entryPtr+8)/4],resource}}function makeEntries(count,entriesPtrs){var entries=[];for(var i=0;i<count;++i){entries.push(makeEntry(entriesPtrs+56*i))}return entries}var desc={label:WebGPU.makeStringFromOptionalStringView(descriptor+8),layout:WebGPU.getJsObject(Number((growMemViews(),HEAPU64)[(descriptor+24)/8])),entries:makeEntries(Number((growMemViews(),HEAPU64)[(descriptor+32)/8]),Number((growMemViews(),HEAPU64)[(descriptor+40)/8]))};var device=WebGPU.getJsObject(devicePtr);var ptr=_emwgpuCreateBindGroup(0n);WebGPU.Internals.jsObjectInsert(ptr,device.createBindGroup(desc));return ptr})();return BigInt(ret)};var _wgpuDeviceCreateCommandEncoder=function(devicePtr,descriptor){devicePtr=bigintToI53Checked(devicePtr);descriptor=bigintToI53Checked(descriptor);var ret=(()=>{var desc;if(descriptor){desc={label:WebGPU.makeStringFromOptionalStringView(descriptor+8)}}var device=WebGPU.getJsObject(devicePtr);var ptr=_emwgpuCreateCommandEncoder(0n);WebGPU.Internals.jsObjectInsert(ptr,device.createCommandEncoder(desc));return ptr})();return BigInt(ret)};var _wgpuDeviceCreateComputePipeline=function(devicePtr,descriptor){devicePtr=bigintToI53Checked(devicePtr);descriptor=bigintToI53Checked(descriptor);var ret=(()=>{var desc=WebGPU.makeComputePipelineDesc(descriptor);var device=WebGPU.getJsObject(devicePtr);var ptr=_emwgpuCreateComputePipeline(0n);WebGPU.Internals.jsObjectInsert(ptr,device.createComputePipeline(desc));return ptr})();return BigInt(ret)};function _wgpuInstanceHasWGSLLanguageFeature(instance,featureEnumValue){instance=bigintToI53Checked(instance);if(!("wgslLanguageFeatures"in navigator.gpu)){return false}return navigator.gpu.wgslLanguageFeatures.has(WebGPU.WGSLLanguageFeatureName[featureEnumValue])}var _wgpuQueueSubmit=function(queuePtr,commandCount,commands){queuePtr=bigintToI53Checked(queuePtr);commandCount=bigintToI53Checked(commandCount);commands=bigintToI53Checked(commands);var queue=WebGPU.getJsObject(queuePtr);var cmds=Array.from((growMemViews(),HEAP64).subarray(commands/8,(commands+commandCount*8)/8),id=>WebGPU.getJsObject(id));queue.submit(cmds)};function _wgpuQueueWriteBuffer(queuePtr,bufferPtr,bufferOffset,data,size){queuePtr=bigintToI53Checked(queuePtr);bufferPtr=bigintToI53Checked(bufferPtr);bufferOffset=bigintToI53Checked(bufferOffset);data=bigintToI53Checked(data);size=bigintToI53Checked(size);var queue=WebGPU.getJsObject(queuePtr);var buffer=WebGPU.getJsObject(bufferPtr);var subarray=(growMemViews(),HEAPU8).subarray(data,data+size);queue.writeBuffer(buffer,bufferOffset,subarray,0,size)}var Asyncify={instrumentWasmImports(imports){var importPattern=/^(invoke_.*|__asyncjs__.*)$/;for(let[x,original]of Object.entries(imports)){if(typeof original=="function"){let isAsyncifyImport=original.isAsync||importPattern.test(x);if(isAsyncifyImport){imports[x]=original=new WebAssembly.Suspending(original)}}}},instrumentFunction(original){var wrapper=(...args)=>original(...args);return wrapper},instrumentWasmExports(exports){var exportPattern=/^(wllama_start|wllama_action|main|__main_argc_argv)$/;Asyncify.asyncExports=new Set;var ret={};for(let[x,original]of Object.entries(exports)){if(typeof original=="function"){let isAsyncifyExport=exportPattern.test(x);if(isAsyncifyExport){Asyncify.asyncExports.add(original);original=Asyncify.makeAsyncFunction(original)}var wrapper=Asyncify.instrumentFunction(original);ret[x]=wrapper}else{ret[x]=original}}return ret},asyncExports:null,isAsyncExport(func){return Asyncify.asyncExports?.has(func)},handleAsync:async startAsync=>{runtimeKeepalivePush();try{return await startAsync()}finally{runtimeKeepalivePop()}},handleSleep:startAsync=>Asyncify.handleAsync(()=>new Promise(startAsync)),makeAsyncFunction(original){return WebAssembly.promising(original)}};var getCFunc=ident=>{var func=Module["_"+ident];return func};var writeArrayToMemory=(array,buffer)=>{(growMemViews(),HEAP8).set(array,buffer)};var ccall=(ident,returnType,argTypes,args,opts)=>{var toC={pointer:p=>BigInt(p),string:str=>{var ret=0;if(str!==null&&str!==undefined&&str!==0){ret=stringToUTF8OnStack(str)}return BigInt(ret)},array:arr=>{var ret=stackAlloc(arr.length);writeArrayToMemory(arr,ret);return BigInt(ret)}};function convertReturnValue(ret){if(returnType==="string"){return UTF8ToString(Number(ret))}if(returnType==="pointer")return Number(ret);if(returnType==="boolean")return Boolean(ret);return ret}var func=getCFunc(ident);var cArgs=[];var stack=0;if(args){for(var i=0;i<args.length;i++){var converter=toC[argTypes[i]];if(converter){if(stack===0)stack=stackSave();cArgs[i]=converter(args[i])}else{cArgs[i]=args[i]}}}var ret=func(...cArgs);function onDone(ret){if(stack!==0)stackRestore(stack);return convertReturnValue(ret)}var asyncMode=opts?.async;if(asyncMode)return ret.then(onDone);ret=onDone(ret);return ret};var cwrap=(ident,returnType,argTypes,opts)=>{var numericArgs=!argTypes||argTypes.every(type=>type==="number"||type==="boolean");var numericRet=returnType!=="string";if(numericRet&&numericArgs&&!opts){return getCFunc(ident)}return(...args)=>ccall(ident,returnType,argTypes,args,opts)};var FS_createPath=(...args)=>FS.createPath(...args);var FS_unlink=(...args)=>FS.unlink(...args);var FS_createLazyFile=(...args)=>FS.createLazyFile(...args);var FS_createDevice=(...args)=>FS.createDevice(...args);PThread.init();FS.createPreloadedFile=FS_createPreloadedFile;FS.preloadFile=FS_preloadFile;FS.staticInit();{initMemory();if(Module["noExitRuntime"])noExitRuntime=Module["noExitRuntime"];if(Module["preloadPlugins"])preloadPlugins=Module["preloadPlugins"];if(Module["print"])out=Module["print"];if(Module["printErr"])err=Module["printErr"];if(Module["wasmBinary"])wasmBinary=Module["wasmBinary"];if(Module["arguments"])arguments_=Module["arguments"];if(Module["thisProgram"])thisProgram=Module["thisProgram"];if(Module["preInit"]){if(typeof Module["preInit"]=="function")Module["preInit"]=[Module["preInit"]];while(Module["preInit"].length>0){Module["preInit"].shift()()}}}Module["ENV"]=ENV;Module["mmapAlloc"]=mmapAlloc;Module["wasmMemory"]=wasmMemory;Module["addRunDependency"]=addRunDependency;Module["removeRunDependency"]=removeRunDependency;Module["ccall"]=ccall;Module["cwrap"]=cwrap;Module["FS_preloadFile"]=FS_preloadFile;Module["FS_unlink"]=FS_unlink;Module["FS_createPath"]=FS_createPath;Module["FS_createDevice"]=FS_createDevice;Module["FS"]=FS;Module["FS_createDataFile"]=FS_createDataFile;Module["FS_createLazyFile"]=FS_createLazyFile;Module["MEMFS"]=MEMFS;var proxiedFunctionTable=[_proc_exit,exitOnMainThread,pthreadCreateProxied,___syscall_fcntl64,___syscall_fstat64,___syscall_getcwd,___syscall_getdents64,___syscall_ioctl,___syscall_lstat64,___syscall_newfstatat,___syscall_openat,___syscall_stat64,__mmap_js,__munmap_js,_environ_get,_environ_sizes_get,_fd_close,_fd_read,_fd_seek,_fd_write];function __asyncjs__js_file_read(path_ptr,offset,req_size,out_ptr){return Asyncify.handleAsync(async()=>await _wllama_js_file_read(UTF8ToString(Number(path_ptr)),Number(offset),Number(req_size),Number(out_ptr)))}__asyncjs__js_file_read.sig="jjjjj";var _malloc,_free,_wllama_malloc,_wllama_start,_wllama_action,_wllama_exit,_wllama_debug,_main,_emwgpuCreateBindGroup,_emwgpuCreateBindGroupLayout,_emwgpuCreateCommandBuffer,_emwgpuCreateCommandEncoder,_emwgpuCreateComputePassEncoder,_emwgpuCreateComputePipeline,_emwgpuCreateExternalTexture,_emwgpuCreatePipelineLayout,_emwgpuCreateQuerySet,_emwgpuCreateRenderBundle,_emwgpuCreateRenderBundleEncoder,_emwgpuCreateRenderPassEncoder,_emwgpuCreateRenderPipeline,_emwgpuCreateSampler,_emwgpuCreateSurface,_emwgpuCreateTexture,_emwgpuCreateTextureView,_emwgpuCreateAdapter,_emwgpuCreateBuffer,_emwgpuCreateDevice,_emwgpuCreateQueue,_emwgpuCreateShaderModule,_emwgpuOnDeviceLostCompleted,_emwgpuOnMapAsyncCompleted,_emwgpuOnRequestAdapterCompleted,_emwgpuOnRequestDeviceCompleted,_emwgpuOnWorkDoneCompleted,_emwgpuOnUncapturedError,__emscripten_tls_init,_pthread_self,_emscripten_builtin_memalign,__emscripten_thread_init,__emscripten_thread_crashed,__emscripten_run_js_on_main_thread,__emscripten_thread_free_data,__emscripten_thread_exit,__emscripten_check_mailbox,_memalign,___trap,_emscripten_stack_set_limits,__emscripten_stack_restore,__emscripten_stack_alloc,_emscripten_stack_get_current,__indirect_function_table,wasmTable;function assignWasmExports(wasmExports){_malloc=wasmExports["malloc"];_free=wasmExports["free"];_wllama_malloc=Module["_wllama_malloc"]=wasmExports["wllama_malloc"];_wllama_start=Module["_wllama_start"]=wasmExports["wllama_start"];_wllama_action=Module["_wllama_action"]=wasmExports["wllama_action"];_wllama_exit=Module["_wllama_exit"]=wasmExports["wllama_exit"];_wllama_debug=Module["_wllama_debug"]=wasmExports["wllama_debug"];_main=Module["_main"]=wasmExports["main"];_emwgpuCreateBindGroup=wasmExports["emwgpuCreateBindGroup"];_emwgpuCreateBindGroupLayout=wasmExports["emwgpuCreateBindGroupLayout"];_emwgpuCreateCommandBuffer=wasmExports["emwgpuCreateCommandBuffer"];_emwgpuCreateCommandEncoder=wasmExports["emwgpuCreateCommandEncoder"];_emwgpuCreateComputePassEncoder=wasmExports["emwgpuCreateComputePassEncoder"];_emwgpuCreateComputePipeline=wasmExports["emwgpuCreateComputePipeline"];_emwgpuCreateExternalTexture=wasmExports["emwgpuCreateExternalTexture"];_emwgpuCreatePipelineLayout=wasmExports["emwgpuCreatePipelineLayout"];_emwgpuCreateQuerySet=wasmExports["emwgpuCreateQuerySet"];_emwgpuCreateRenderBundle=wasmExports["emwgpuCreateRenderBundle"];_emwgpuCreateRenderBundleEncoder=wasmExports["emwgpuCreateRenderBundleEncoder"];_emwgpuCreateRenderPassEncoder=wasmExports["emwgpuCreateRenderPassEncoder"];_emwgpuCreateRenderPipeline=wasmExports["emwgpuCreateRenderPipeline"];_emwgpuCreateSampler=wasmExports["emwgpuCreateSampler"];_emwgpuCreateSurface=wasmExports["emwgpuCreateSurface"];_emwgpuCreateTexture=wasmExports["emwgpuCreateTexture"];_emwgpuCreateTextureView=wasmExports["emwgpuCreateTextureView"];_emwgpuCreateAdapter=wasmExports["emwgpuCreateAdapter"];_emwgpuCreateBuffer=wasmExports["emwgpuCreateBuffer"];_emwgpuCreateDevice=wasmExports["emwgpuCreateDevice"];_emwgpuCreateQueue=wasmExports["emwgpuCreateQueue"];_emwgpuCreateShaderModule=wasmExports["emwgpuCreateShaderModule"];_emwgpuOnDeviceLostCompleted=wasmExports["emwgpuOnDeviceLostCompleted"];_emwgpuOnMapAsyncCompleted=wasmExports["emwgpuOnMapAsyncCompleted"];_emwgpuOnRequestAdapterCompleted=wasmExports["emwgpuOnRequestAdapterCompleted"];_emwgpuOnRequestDeviceCompleted=wasmExports["emwgpuOnRequestDeviceCompleted"];_emwgpuOnWorkDoneCompleted=wasmExports["emwgpuOnWorkDoneCompleted"];_emwgpuOnUncapturedError=wasmExports["emwgpuOnUncapturedError"];__emscripten_tls_init=wasmExports["_emscripten_tls_init"];_pthread_self=wasmExports["pthread_self"];_emscripten_builtin_memalign=wasmExports["emscripten_builtin_memalign"];__emscripten_thread_init=wasmExports["_emscripten_thread_init"];__emscripten_thread_crashed=wasmExports["_emscripten_thread_crashed"];__emscripten_run_js_on_main_thread=wasmExports["_emscripten_run_js_on_main_thread"];__emscripten_thread_free_data=wasmExports["_emscripten_thread_free_data"];__emscripten_thread_exit=wasmExports["_emscripten_thread_exit"];__emscripten_check_mailbox=wasmExports["_emscripten_check_mailbox"];_memalign=wasmExports["memalign"];___trap=wasmExports["__trap"];_emscripten_stack_set_limits=wasmExports["emscripten_stack_set_limits"];__emscripten_stack_restore=wasmExports["_emscripten_stack_restore"];__emscripten_stack_alloc=wasmExports["_emscripten_stack_alloc"];_emscripten_stack_get_current=wasmExports["emscripten_stack_get_current"];__indirect_function_table=wasmTable=wasmExports["__indirect_function_table"]}var wasmImports;function assignWasmImports(){wasmImports={__asyncjs__js_file_read,__pthread_create_js:___pthread_create_js,__syscall_fcntl64:___syscall_fcntl64,__syscall_getcwd:___syscall_getcwd,__syscall_getdents64:___syscall_getdents64,__syscall_ioctl:___syscall_ioctl,__syscall_openat:___syscall_openat,__syscall_stat64:___syscall_stat64,_abort_js:__abort_js,_emscripten_init_main_thread_js:__emscripten_init_main_thread_js,_emscripten_notify_mailbox_postmessage:__emscripten_notify_mailbox_postmessage,_emscripten_receive_on_main_thread_js:__emscripten_receive_on_main_thread_js,_emscripten_thread_cleanup:__emscripten_thread_cleanup,_emscripten_thread_mailbox_await:__emscripten_thread_mailbox_await,_emscripten_thread_set_strongref:__emscripten_thread_set_strongref,_localtime_js:__localtime_js,_mmap_js:__mmap_js,_munmap_js:__munmap_js,_tzset_js:__tzset_js,clock_time_get:_clock_time_get,emscripten_check_blocking_allowed:_emscripten_check_blocking_allowed,emscripten_date_now:_emscripten_date_now,emscripten_exit_with_live_runtime:_emscripten_exit_with_live_runtime,emscripten_get_callstack:_emscripten_get_callstack,emscripten_get_heap_max:_emscripten_get_heap_max,emscripten_get_now:_emscripten_get_now,emscripten_has_asyncify:_emscripten_has_asyncify,emscripten_num_logical_cores:_emscripten_num_logical_cores,emscripten_resize_heap:_emscripten_resize_heap,emwgpuAdapterRequestDevice:_emwgpuAdapterRequestDevice,emwgpuBufferDestroy:_emwgpuBufferDestroy,emwgpuBufferGetConstMappedRange:_emwgpuBufferGetConstMappedRange,emwgpuBufferMapAsync:_emwgpuBufferMapAsync,emwgpuBufferUnmap:_emwgpuBufferUnmap,emwgpuDelete:_emwgpuDelete,emwgpuDeviceCreateBuffer:_emwgpuDeviceCreateBuffer,emwgpuDeviceCreateShaderModule:_emwgpuDeviceCreateShaderModule,emwgpuDeviceDestroy:_emwgpuDeviceDestroy,emwgpuInstanceRequestAdapter:_emwgpuInstanceRequestAdapter,emwgpuQueueOnSubmittedWorkDone:_emwgpuQueueOnSubmittedWorkDone,emwgpuWaitAny:_emwgpuWaitAny,environ_get:_environ_get,environ_sizes_get:_environ_sizes_get,exit:_exit,fd_close:_fd_close,fd_read:_fd_read,fd_seek:_fd_seek,fd_write:_fd_write,memory:wasmMemory,random_get:_random_get,wgpuAdapterGetInfo:_wgpuAdapterGetInfo,wgpuAdapterGetLimits:_wgpuAdapterGetLimits,wgpuAdapterHasFeature:_wgpuAdapterHasFeature,wgpuBufferGetSize:_wgpuBufferGetSize,wgpuCommandEncoderBeginComputePass:_wgpuCommandEncoderBeginComputePass,wgpuCommandEncoderCopyBufferToBuffer:_wgpuCommandEncoderCopyBufferToBuffer,wgpuCommandEncoderFinish:_wgpuCommandEncoderFinish,wgpuComputePassEncoderDispatchWorkgroups:_wgpuComputePassEncoderDispatchWorkgroups,wgpuComputePassEncoderEnd:_wgpuComputePassEncoderEnd,wgpuComputePassEncoderSetBindGroup:_wgpuComputePassEncoderSetBindGroup,wgpuComputePassEncoderSetPipeline:_wgpuComputePassEncoderSetPipeline,wgpuComputePipelineGetBindGroupLayout:_wgpuComputePipelineGetBindGroupLayout,wgpuDeviceCreateBindGroup:_wgpuDeviceCreateBindGroup,wgpuDeviceCreateCommandEncoder:_wgpuDeviceCreateCommandEncoder,wgpuDeviceCreateComputePipeline:_wgpuDeviceCreateComputePipeline,wgpuInstanceHasWGSLLanguageFeature:_wgpuInstanceHasWGSLLanguageFeature,wgpuQueueSubmit:_wgpuQueueSubmit,wgpuQueueWriteBuffer:_wgpuQueueWriteBuffer}}function applySignatureConversions(wasmExports){wasmExports=Object.assign({},wasmExports);var makeWrapper_pp=f=>a0=>Number(f(BigInt(a0)));var makeWrapper__p=f=>a0=>f(BigInt(a0));var makeWrapper___PP=f=>(a0,a1,a2)=>f(a0,BigInt(a1?a1:0),BigInt(a2?a2:0));var makeWrapper_p=f=>()=>Number(f());var makeWrapper_ppp=f=>(a0,a1)=>Number(f(BigInt(a0),BigInt(a1)));var makeWrapper__p_____=f=>(a0,a1,a2,a3,a4,a5)=>f(BigInt(a0),a1,a2,a3,a4,a5);var makeWrapper___p_p_=f=>(a0,a1,a2,a3,a4)=>f(a0,BigInt(a1),a2,BigInt(a3),a4);var makeWrapper__pp=f=>(a0,a1)=>f(BigInt(a0),BigInt(a1));wasmExports["malloc"]=makeWrapper_pp(wasmExports["malloc"]);wasmExports["free"]=makeWrapper__p(wasmExports["free"]);wasmExports["main"]=makeWrapper___PP(wasmExports["main"]);wasmExports["pthread_self"]=makeWrapper_p(wasmExports["pthread_self"]);wasmExports["emscripten_builtin_memalign"]=makeWrapper_ppp(wasmExports["emscripten_builtin_memalign"]);wasmExports["_emscripten_thread_init"]=makeWrapper__p_____(wasmExports["_emscripten_thread_init"]);wasmExports["_emscripten_run_js_on_main_thread"]=makeWrapper___p_p_(wasmExports["_emscripten_run_js_on_main_thread"]);wasmExports["_emscripten_thread_free_data"]=makeWrapper__p(wasmExports["_emscripten_thread_free_data"]);wasmExports["_emscripten_thread_exit"]=makeWrapper__p(wasmExports["_emscripten_thread_exit"]);wasmExports["memalign"]=makeWrapper_ppp(wasmExports["memalign"]);wasmExports["emscripten_stack_set_limits"]=makeWrapper__pp(wasmExports["emscripten_stack_set_limits"]);wasmExports["_emscripten_stack_restore"]=makeWrapper__p(wasmExports["_emscripten_stack_restore"]);wasmExports["_emscripten_stack_alloc"]=makeWrapper_pp(wasmExports["_emscripten_stack_alloc"]);wasmExports["emscripten_stack_get_current"]=makeWrapper_p(wasmExports["emscripten_stack_get_current"]);return wasmExports}async function callMain(){var entryFunction=_main;var argc=0;var argv=0;try{var ret=entryFunction(argc,BigInt(argv));ret=await ret;exitJS(ret,true);return ret}catch(e){return handleException(e)}}function run(){if(runDependencies>0){dependenciesFulfilled=run;return}if(ENVIRONMENT_IS_PTHREAD){initRuntime();return}preRun();if(runDependencies>0){dependenciesFulfilled=run;return}async function doRun(){Module["calledRun"]=true;if(ABORT)return;initRuntime();preMain();Module["onRuntimeInitialized"]?.();var noInitialRun=Module["noInitialRun"]||false;if(!noInitialRun)await callMain();postRun()}if(Module["setStatus"]){Module["setStatus"]("Running...");setTimeout(()=>{setTimeout(()=>Module["setStatus"](""),1);doRun()},1)}else{doRun()}}var wasmExports;if(!ENVIRONMENT_IS_PTHREAD){createWasm();run()}\n';

// src/worker.ts
var FILE_READ_REQ_EVENT = "fs.read_req";
var JSPI_STUB = `
if (!WebAssembly.Suspending) {
  // JSPI not available - stubs that keep the import/export tables valid.
  // Suspending wraps imports: identity is fine since async imports won't be called.
  WebAssembly.Suspending = function (fn) {
    // console.log(fn.toString());
    return fn;
  };
  // promising wraps exports: must return a Promise so ccall's ret.then() works.
  WebAssembly.promising = function (fn) {
    return function (...args) {
      try {
        return Promise.resolve(fn(...args));
      } catch (e) {
        return Promise.reject(e);
      }
    };
  };
}
`;
var ProxyToWorker = class {
  // filename -> Blob for async reads
  constructor(resources, nbThread, suppressNativeLog, logger) {
    __publicField(this, "resources");
    __publicField(this, "logger");
    __publicField(this, "suppressNativeLog");
    __publicField(this, "taskQueue", []);
    __publicField(this, "taskId", 1);
    __publicField(this, "resultQueue", []);
    __publicField(this, "busy", false);
    // is the work loop is running?
    __publicField(this, "worker");
    __publicField(this, "multiThread");
    __publicField(this, "nbThread");
    __publicField(this, "useAsyncFile");
    __publicField(this, "fileBlobs", /* @__PURE__ */ new Map());
    this.resources = resources;
    this.nbThread = nbThread;
    this.multiThread = nbThread > 0;
    this.logger = logger;
    this.suppressNativeLog = suppressNativeLog;
    this.useAsyncFile = canUseAsyncFileRead(resources.compat);
  }
  getModuleCode() {
    return __async(this, null, function* () {
      if (!this.resources.jsPath) {
        if (this.resources.compat) {
          throw new Error(
            "compat mode is enabled but no jsPath was provided. Pass a worker JS via setCompat() or install @wllama/wllama-compat."
          );
        }
        return WLLAMA_EMSCRIPTEN_CODE;
      } else if (this.resources.jsPath.code) {
        return this.resources.jsPath.code;
      } else if (isString(this.resources.jsPath)) {
        const response = yield fetch(this.resources.jsPath);
        if (!response.ok) {
          throw new Error(
            `Failed to fetch worker code from ${this.resources.jsPath}`
          );
        }
        return yield response.text();
      } else {
        throw new Error("No JS code provided for worker");
      }
    });
  }
  moduleInit(ggufFiles) {
    return __async(this, null, function* () {
      let moduleCode = JSPI_STUB + (yield this.getModuleCode());
      if (this.resources.noWebGPU) {
        moduleCode = 'try{Object.defineProperty(WorkerNavigator.prototype,"gpu",{get:()=>({requestAdapter:async()=>null})});}catch(e){}' + moduleCode;
      }
      let mainModuleCode = moduleCode.replace("var Module", "var ___Module");
      const runOptions = {
        pathConfig: {
          "wllama.wasm": this.resources.wasmPath
        },
        nbThread: this.nbThread,
        compat: this.resources.compat
      };
      const completeCode = [
        `const RUN_OPTIONS = ${JSON.stringify(runOptions)};`,
        `function wModuleInit() { ${mainModuleCode}; return Module; }`,
        LLAMA_CPP_WORKER_CODE
      ].join(";\n\n");
      this.worker = createWorker(completeCode);
      this.worker.onmessage = this.onRecvMsg.bind(this);
      this.worker.onerror = this.logger.error;
      const res = yield this.pushTask({
        verb: "module.init",
        args: [
          new Blob([moduleCode], { type: "text/javascript" }),
          this.useAsyncFile
        ],
        callbackId: this.taskId++
      });
      const nativeFiles = [];
      for (const file of ggufFiles) {
        const needAllocBuffer = !this.useAsyncFile;
        const id = yield this.fileAlloc(
          file.name,
          file.blob.size,
          needAllocBuffer
        );
        nativeFiles.push(__spreadValues({ id }, file));
        if (this.useAsyncFile) {
          this.fileBlobs.set(file.name, file.blob);
        }
      }
      if (!this.useAsyncFile) {
        yield Promise.all(
          nativeFiles.map((file) => {
            return this.fileWrite(file.id, file.blob);
          })
        );
      }
      return res;
    });
  }
  wllamaStart() {
    return __async(this, null, function* () {
      const result = yield this.pushTask({
        verb: "wllama.start",
        args: [],
        callbackId: this.taskId++
      });
      const parsedResult = this.parseResult(result);
      return parsedResult;
    });
  }
  wllamaAction(name, body) {
    return __async(this, null, function* () {
      const encodedMsg = glueSerialize(body);
      const result = yield this.pushTask({
        verb: "wllama.action",
        args: [name, encodedMsg],
        callbackId: this.taskId++
      });
      const parsedResult = glueDeserialize(result);
      return parsedResult;
    });
  }
  wllamaExit() {
    return __async(this, null, function* () {
      if (this.worker) {
        this.worker.terminate();
      }
    });
  }
  wllamaDebug() {
    return __async(this, null, function* () {
      const result = yield this.pushTask({
        verb: "wllama.debug",
        args: [],
        callbackId: this.taskId++
      });
      return JSON.parse(result);
    });
  }
  ///////////////////////////////////////
  /**
   * Allocate a new file in heapfs
   * @returns fileId, to be used by fileWrite()
   */
  fileAlloc(fileName, size, allocBuffer) {
    return __async(this, null, function* () {
      const result = yield this.pushTask({
        verb: "fs.alloc",
        args: [fileName, size, allocBuffer],
        callbackId: this.taskId++
      });
      return result.fileId;
    });
  }
  /**
   * Write a Blob to heapfs
   */
  fileWrite(fileId, blob) {
    return __async(this, null, function* () {
      const reader = blob.stream().getReader();
      let offset = 0;
      while (true) {
        const { done, value } = yield reader.read();
        if (done) break;
        const size = value.byteLength;
        yield this.pushTask(
          {
            verb: "fs.write",
            args: [fileId, value, offset],
            callbackId: this.taskId++
          },
          // @ts-ignore Type 'ArrayBufferLike' is not assignable to type 'ArrayBuffer'
          [value.buffer]
        );
        offset += size;
      }
    });
  }
  fileReadResponse(name, offset, size) {
    return __async(this, null, function* () {
      var _a;
      try {
        const blob = this.fileBlobs.get(name);
        if (!blob) {
          throw new Error(`blob not found for name="${name}"`);
        }
        const chunk = blob.slice(offset, offset + size);
        const buffer = yield chunk.arrayBuffer();
        this.worker.postMessage(
          { verb: "fs.read_res", args: [buffer] },
          { transfer: [buffer] }
        );
      } catch (err) {
        this.logger.error("fileReadResponse failed, terminating worker:", err);
        (_a = this.worker) == null ? void 0 : _a.terminate();
        this.worker = void 0;
        this.abort(`File read failed: ${err}`, err.stack || "");
      }
    });
  }
  /**
   * Parse JSON result returned by cpp code.
   * Throw new Error if "__exception" is present in the response
   *
   * TODO: get rid of this function once everything is migrated to Glue
   */
  parseResult(result) {
    const parsedResult = JSON.parse(result);
    if (parsedResult && parsedResult["error"]) {
      throw new WllamaRuntimeError("Unknown error, please see console.log", "");
    }
    return parsedResult;
  }
  /**
   * Push a new task to taskQueue
   */
  pushTask(param, buffers) {
    return new Promise((resolve, reject) => {
      this.taskQueue.push({ resolve, reject, param, buffers });
      this.runTaskLoop();
    });
  }
  /**
   * Main loop for processing tasks
   */
  runTaskLoop() {
    return __async(this, null, function* () {
      var _a;
      if (this.busy) {
        return;
      }
      this.busy = true;
      while (true) {
        const task = this.taskQueue.shift();
        if (!task) break;
        this.resultQueue.push(task);
        this.worker.postMessage(
          task.param,
          isSafariMobile() ? void 0 : {
            transfer: (_a = task.buffers) != null ? _a : []
          }
        );
      }
      this.busy = false;
    });
  }
  /**
   * Handle messages from worker
   */
  onRecvMsg(e) {
    if (!e.data) return;
    const { verb, args } = e.data;
    const isCompatBuild = this.resources.compat;
    if (verb && verb.startsWith("console.")) {
      if (this.suppressNativeLog) {
        return;
      }
      if (verb.endsWith("debug")) this.logger.debug(...args);
      if (verb.endsWith("log")) this.logger.log(...args);
      if (verb.endsWith("warn")) this.logger.warn(...args);
      if (verb.endsWith("error")) this.logger.error(...args);
      return;
    } else if (verb === "signal.abort") {
      const [signalType, message, rawStack, originalErr] = args;
      if (originalErr) {
        this.logger.error(originalErr);
      }
      (() => __async(this, null, function* () {
        let stack = "";
        let newMsg = message.replace(
          "Build with -sASSERTIONS for more info.",
          ""
        );
        if (signalType === "abort") {
          newMsg = `(ABORT) ${newMsg}`;
          stack = rawStack.replace(/\|/g, "\n");
        } else if (signalType === "exception") {
          stack = rawStack;
        }
        const decoded = yield Debug.decodeStackTrace(stack, isCompatBuild);
        this.logger.error(`Stack trace (${signalType}):
` + decoded);
        this.abort(newMsg, decoded);
      }))();
      return;
    }
    if (verb === FILE_READ_REQ_EVENT) {
      const [name, offset, size] = args;
      this.fileReadResponse(name, offset, size).catch(() => {
      });
      return;
    }
    const { callbackId, result, err } = e.data;
    if (callbackId) {
      const idx = this.resultQueue.findIndex(
        (t) => t.param.callbackId === callbackId
      );
      if (idx !== -1) {
        const waitingTask = this.resultQueue.splice(idx, 1)[0];
        if (err) waitingTask.reject(err);
        else waitingTask.resolve(result);
      } else {
        this.logger.error(
          `Cannot find waiting task with callbackId = ${callbackId}`
        );
      }
    }
  }
  abort(text, stack) {
    const error = new WllamaRuntimeError(
      text.length == 0 ? "(unknown error)" : text,
      stack
    );
    while (this.resultQueue.length > 0) {
      const waitingTask = this.resultQueue.pop();
      if (!waitingTask) break;
      waitingTask.reject(error);
    }
    while (this.taskQueue.length > 0) {
      const pendingTask = this.taskQueue.pop();
      if (!pendingTask) break;
      pendingTask.reject(error);
    }
  }
};

// src/huggingface.ts
var HF_BASE = "https://huggingface.co";
var DEFAULT_QUANTS = ["Q4_K_M", "Q8_0"];
function fetchRepoFiles(repo, token) {
  return __async(this, null, function* () {
    var _a;
    const url = `${HF_BASE}/api/models/${repo}/tree/main?recursive=true`;
    const headers = { Accept: "application/json" };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    const res = yield fetch(url, { headers });
    if (!res.ok) {
      let msg = res.statusText;
      try {
        msg = (_a = (yield res.json()).error) != null ? _a : msg;
      } catch (e) {
      }
      throw new Error(`HF API error (${res.status}): ${msg}`);
    }
    return res.json();
  });
}
function firstShardPath(files, path) {
  const m = path.match(/^(.+)-(\d{5})-of-(\d{5})\.gguf$/i);
  if (!m) return path;
  const first = `${m[1]}-00001-of-${m[3]}.gguf`;
  return files.some((f) => f.path === first) ? first : path;
}
function selectFile(files, quant, mmprojOnly) {
  const candidates = files.filter((f) => {
    if (f.type !== "file" || !f.path.toLowerCase().endsWith(".gguf"))
      return false;
    const ismmproj = f.path.toLowerCase().includes("mmproj");
    return mmprojOnly ? ismmproj : !ismmproj;
  });
  if (candidates.length === 0) return null;
  if (quant) {
    const upper = quant.toUpperCase();
    const match = candidates.find((f) => f.path.toUpperCase().includes(upper));
    if (match) return firstShardPath(candidates, match.path);
    return null;
  }
  for (const q of DEFAULT_QUANTS) {
    const match = candidates.find((f) => f.path.toUpperCase().includes(q));
    if (match) return firstShardPath(candidates, match.path);
  }
  return firstShardPath(candidates, candidates[0].path);
}
function getHFModelSource(config) {
  return __async(this, null, function* () {
    const { repo, file, quant, mmprojFile, mmprojQuant, hfToken } = config;
    const files = yield fetchRepoFiles(repo, hfToken);
    const modelPath = file != null ? file : selectFile(files, quant, false);
    if (!modelPath) {
      throw new Error(`No GGUF file found in repo "${repo}"`);
    }
    const source = {
      url: `${HF_BASE}/${repo}/resolve/main/${modelPath}`
    };
    if (mmprojFile || mmprojQuant !== void 0) {
      const mmpath = mmprojFile != null ? mmprojFile : selectFile(files, mmprojQuant, true);
      if (mmpath) {
        source.mmprojUrl = `${HF_BASE}/${repo}/resolve/main/${mmpath}`;
      }
    }
    if (hfToken) {
      const params = new URLSearchParams({ token: hfToken });
      source.url += `?${params}`;
      if (source.mmprojUrl) {
        source.mmprojUrl += `?${params}`;
      }
    }
    return source;
  });
}
function getHFFileSHA256(url, headers) {
  return __async(this, null, function* () {
    if (!url.includes("/resolve/")) return void 0;
    const rawUrl = url.replace("/resolve/", "/raw/");
    try {
      const text = yield fetch(rawUrl, { headers }).then((r) => r.text());
      const match = text.match(/^oid sha256:([0-9a-f]{64})$/m);
      return match ? match[1] : void 0;
    } catch (e) {
      return void 0;
    }
  });
}

// src/storage/opfs.ts
var OPFSBackend = class {
  isSupported() {
    var _a;
    return typeof navigator !== "undefined" && "storage" in navigator && !!((_a = navigator.storage) == null ? void 0 : _a.getDirectory);
  }
  read(key) {
    return __async(this, null, function* () {
      try {
        const cacheDir = yield getCacheDir();
        const fileHandle = yield cacheDir.getFileHandle(key);
        return yield fileHandle.getFile();
      } catch (e) {
        return null;
      }
    });
  }
  write(key, stream) {
    return __async(this, null, function* () {
      const writable = yield openWritable(key);
      yield writable.truncate(0);
      const reader = stream.getReader();
      try {
        while (true) {
          const { done, value } = yield reader.read();
          if (done) break;
          yield writable.write(value);
        }
      } finally {
        yield writable.close();
      }
    });
  }
  getSize(key) {
    return __async(this, null, function* () {
      try {
        const cacheDir = yield getCacheDir();
        const fileHandle = yield cacheDir.getFileHandle(key);
        const file = yield fileHandle.getFile();
        return file.size;
      } catch (e) {
        return -1;
      }
    });
  }
  list() {
    return __async(this, null, function* () {
      const cacheDir = yield getCacheDir();
      const result = [];
      try {
        for (var iter = __forAwait(cacheDir.entries()), more, temp, error; more = !(temp = yield iter.next()).done; more = false) {
          const [name, handle] = temp.value;
          if (handle.kind === "file") {
            const file = yield handle.getFile();
            result.push({ key: name, size: file.size });
          }
        }
      } catch (temp) {
        error = [temp];
      } finally {
        try {
          more && (temp = iter.return) && (yield temp.call(iter));
        } finally {
          if (error)
            throw error[0];
        }
      }
      return result;
    });
  }
  delete(key) {
    return __async(this, null, function* () {
      try {
        const cacheDir = yield getCacheDir();
        yield cacheDir.removeEntry(key);
      } catch (e) {
        if ((e == null ? void 0 : e.name) !== "NotFoundError") throw e;
      }
    });
  }
};
function getCacheDir() {
  return __async(this, null, function* () {
    const opfsRoot = yield navigator.storage.getDirectory();
    return opfsRoot.getDirectoryHandle("cache", { create: true });
  });
}
function openWritable(fileName) {
  return __async(this, null, function* () {
    const worker = createWorker(OPFS_UTILS_WORKER_CODE);
    let pResolve;
    let pReject;
    worker.onmessage = (e) => {
      if (e.data.ok) pResolve(null);
      else if (e.data.err) pReject(e.data.err);
    };
    worker.onerror = (e) => {
      var _a;
      return pReject == null ? void 0 : pReject((_a = e.message) != null ? _a : e);
    };
    const workerExec = (data) => new Promise((resolve, reject) => {
      pResolve = resolve;
      pReject = reject;
      worker.postMessage(
        data,
        isSafariMobile() ? void 0 : { transfer: "buf" in data && data.buf ? [data.buf.buffer] : [] }
      );
    });
    yield workerExec({ action: "open", filename: fileName });
    return {
      truncate: () => __async(this, null, function* () {
      }),
      write: (value) => workerExec({ action: "write", buf: value }),
      close: () => __async(this, null, function* () {
        yield workerExec({ action: "close" });
        worker.terminate();
      })
    };
  });
}

// src/storage/cos.ts
function makeHash(key) {
  return { algorithm: "SHA-256", value: key };
}
var COSInternalBackend = class {
  isSupported() {
    return typeof navigator !== "undefined" && "crossOriginStorage" in navigator;
  }
  // IMPORTANT: key must be SHA-256 hash of the data
  read(key) {
    return __async(this, null, function* () {
      try {
        const handle = yield navigator.crossOriginStorage.requestFileHandle(
          makeHash(key)
        );
        return handle.getFile();
      } catch (e) {
        return null;
      }
    });
  }
  // IMPORTANT: key must be SHA-256 hash of the data
  write(key, stream) {
    return __async(this, null, function* () {
      const handle = yield navigator.crossOriginStorage.requestFileHandle(
        makeHash(key),
        { create: true }
      );
      const writable = yield handle.createWritable();
      const reader = stream.getReader();
      try {
        while (true) {
          const { done, value } = yield reader.read();
          if (done) break;
          yield writable.write(value);
        }
      } finally {
        yield writable.close();
      }
    });
  }
  // IMPORTANT: key must be SHA-256 hash of the data
  getSize(key) {
    return __async(this, null, function* () {
      try {
        const handle = yield navigator.crossOriginStorage.requestFileHandle(
          makeHash(key)
        );
        const file = yield handle.getFile();
        return file.size;
      } catch (e) {
        return -1;
      }
    });
  }
  list() {
    return __async(this, null, function* () {
      throw new Error("not implemented");
    });
  }
  delete(_key) {
    return __async(this, null, function* () {
      throw new Error("not implemented");
    });
  }
};
var COSBackend = class {
  constructor() {
    __publicField(this, "cos", new COSInternalBackend());
    __publicField(this, "priv", new OPFSBackend());
  }
  isSupported() {
    return this.priv.isSupported();
  }
  read(key, hint) {
    return __async(this, null, function* () {
      if ((hint == null ? void 0 : hint.sha256) && this.cos.isSupported()) {
        const blob = yield this.cos.read(hint.sha256);
        if (blob) return blob;
      }
      return this.priv.read(key);
    });
  }
  write(key, stream, hint) {
    return __async(this, null, function* () {
      if ((hint == null ? void 0 : hint.sha256) && this.cos.isSupported()) {
        yield this.cos.write(hint.sha256, stream);
      } else {
        yield this.priv.write(key, stream);
      }
    });
  }
  getSize(key, hint) {
    return __async(this, null, function* () {
      if ((hint == null ? void 0 : hint.sha256) && this.cos.isSupported()) {
        const size = yield this.cos.getSize(hint.sha256);
        if (size !== -1) return size;
      }
      return this.priv.getSize(key);
    });
  }
  list() {
    return __async(this, null, function* () {
      return this.priv.list();
    });
  }
  delete(key) {
    return __async(this, null, function* () {
      return this.priv.delete(key);
    });
  }
};

// src/cache-manager.ts
var PREFIX_METADATA = "__metadata__";
var POLYFILL_ETAG = "polyfill_for_older_version";
function hintFromMetadata(metadata) {
  if (!metadata) return void 0;
  if (metadata.sha256) return { sha256: metadata.sha256 };
  return void 0;
}
var CacheManager = class {
  /**
   * @param backends Array of storage backends to use, in order of preference ; if first is available, use it, otherwise try the next one.
   */
  constructor(backends = [new COSBackend()]) {
    __publicField(this, "sb");
    for (const backend of backends) {
      if (backend.isSupported()) {
        this.sb = backend;
        return;
      }
    }
    throw new Error("No supported storage backend found");
  }
  /**
   * Convert a given URL into a storage key.
   *
   * Format: `${hashSHA1(fullURL)}_${fileName}`
   */
  getNameFromURL(url) {
    return __async(this, null, function* () {
      return urlToFileName(url, "");
    });
  }
  /**
   * @deprecated Use `download()` instead
   *
   * Write a new file to cache. This will overwrite existing file.
   *
   * @param name The file name returned by `getNameFromURL()` or `list()`
   */
  write(name, stream, metadata) {
    return __async(this, null, function* () {
      yield this.sb.write(name, stream);
      yield this.writeMetadata(name, metadata);
    });
  }
  download(_0) {
    return __async(this, arguments, function* (url, options = {}) {
      var _a, _b, _c, _d;
      const fileKey = yield urlToFileName(url, "");
      const sha256 = yield getHFFileSHA256(url, (_a = options.headers) != null ? _a : {});
      const hint = sha256 ? { sha256 } : void 0;
      const cachedSize = yield this.sb.getSize(fileKey, hint);
      if (cachedSize !== -1) {
        const metadata2 = yield this.readMetadata(fileKey);
        if ((metadata2 == null ? void 0 : metadata2.originalURL) === url && metadata2.originalSize === cachedSize) {
          return;
        }
        const head = yield fetch(url, __spreadValues({
          method: "HEAD"
        }, options.headers ? { headers: options.headers } : {}));
        const originalSize = parseInt(
          (_b = head.headers.get("content-length")) != null ? _b : "0",
          10
        );
        const etag2 = (head.headers.get("etag") || "").replace(
          /[^A-Za-z0-9]/g,
          ""
        );
        if (originalSize > 0 && originalSize === cachedSize) {
          yield this.writeMetadata(fileKey, __spreadValues({
            originalURL: url,
            originalSize,
            etag: etag2,
            sha256
          }, (_c = options.metadataAdditional) != null ? _c : {}));
          return;
        }
        yield this.sb.delete(fileKey);
        yield this.sb.delete(`${PREFIX_METADATA}${fileKey}`);
      }
      const response = yield fetch(url, __spreadValues(__spreadValues({}, options.headers ? { headers: options.headers } : {}), options.signal ? { signal: options.signal } : {}));
      if (!response.ok || !response.body) {
        throw new Error(`Failed to fetch ${url}: HTTP ${response.status}`);
      }
      const contentLength = response.headers.get("content-length");
      const etag = (response.headers.get("etag") || "").replace(
        /[^A-Za-z0-9]/g,
        ""
      );
      const total = parseInt(contentLength != null ? contentLength : "0", 10);
      const progressCallback = options.progressCallback;
      let loaded = 0;
      let lastProgressAt = 0;
      const progressStream = new TransformStream({
        transform(chunk, controller) {
          loaded += chunk.byteLength;
          if (progressCallback) {
            const now = Date.now();
            if (now - lastProgressAt > 100) {
              lastProgressAt = now;
              progressCallback({ loaded, total });
            }
          }
          controller.enqueue(chunk);
        },
        flush() {
          progressCallback == null ? void 0 : progressCallback({ loaded, total: total || loaded });
        }
      });
      const metadata = __spreadValues({
        originalURL: url,
        originalSize: total,
        etag
      }, (_d = options.metadataAdditional) != null ? _d : {});
      if (sha256) {
        metadata.sha256 = sha256;
      }
      yield this.sb.write(
        fileKey,
        response.body.pipeThrough(progressStream),
        hint
      );
      yield this.writeMetadata(fileKey, metadata);
    });
  }
  /**
   * Open a file in cache for reading
   *
   * @param nameOrURL The file name returned by `getNameFromURL()` or `list()`, or the original URL of the remote file
   * @returns Blob, or null if file does not exist
   */
  open(nameOrURL) {
    return __async(this, null, function* () {
      const hint1 = hintFromMetadata(yield this.getMetadata(nameOrURL));
      const direct = yield this.sb.read(nameOrURL, hint1);
      if (direct) return direct;
      const key = yield urlToFileName(nameOrURL, "");
      const hint2 = hintFromMetadata(yield this.getMetadata(key));
      return this.sb.read(key, hint2);
    });
  }
  /**
   * Get the size of a file in stored cache
   *
   * NOTE: in case the download is stopped mid-way (i.e. user close browser tab), the file maybe corrupted, size maybe different from `metadata.originalSize`
   *
   * @param name The file name returned by `getNameFromURL()` or `list()`
   * @returns number of bytes, or -1 if file does not exist
   */
  getSize(name) {
    return __async(this, null, function* () {
      const hint = hintFromMetadata(yield this.getMetadata(name));
      return this.sb.getSize(name, hint);
    });
  }
  /**
   * Get metadata of a cached file
   */
  getMetadata(name) {
    return __async(this, null, function* () {
      const metadata = yield this.readMetadata(name);
      if (metadata) return metadata;
      const cachedSize = yield this.sb.getSize(name);
      return cachedSize > 0 ? (
        // files created by older version of wllama don't have metadata; polyfill it
        {
          etag: POLYFILL_ETAG,
          originalSize: cachedSize,
          originalURL: ""
        }
      ) : (
        // cached file not found
        null
      );
    });
  }
  /**
   * Same as `getMetadata()`, but without polyfill. Returns null if the file has no metadata.
   */
  readMetadata(name) {
    return __async(this, null, function* () {
      const blob = yield this.sb.read(`${PREFIX_METADATA}${name}`);
      if (!blob) return null;
      try {
        return yield new Response(blob).json();
      } catch (e) {
        return null;
      }
    });
  }
  /**
   * List all files currently in cache
   */
  list() {
    return __async(this, null, function* () {
      const all = yield this.sb.list();
      const metadataMap = {};
      for (const { key } of all) {
        if (key.startsWith(PREFIX_METADATA)) {
          const blob = yield this.sb.read(key);
          if (blob) {
            const meta = yield new Response(blob).json().catch(() => null);
            metadataMap[key.slice(PREFIX_METADATA.length)] = meta;
          }
        }
      }
      const result = [];
      for (const { key, size } of all) {
        if (!key.startsWith(PREFIX_METADATA)) {
          result.push({
            name: key,
            size,
            metadata: metadataMap[key] || {
              originalSize: size,
              originalURL: "",
              etag: ""
            }
          });
        }
      }
      return result;
    });
  }
  /**
   * Clear all files currently in cache
   */
  clear() {
    return __async(this, null, function* () {
      yield this.deleteMany(() => true);
    });
  }
  /**
   * Delete a single file in cache
   *
   * @param nameOrURL Can be either an URL or a name returned by `getNameFromURL()` or `list()`
   */
  delete(nameOrURL) {
    return __async(this, null, function* () {
      const name2 = yield this.getNameFromURL(nameOrURL);
      yield this.deleteMany(
        (entry) => entry.name === nameOrURL || entry.name === name2
      );
    });
  }
  /**
   * Delete multiple files in cache.
   *
   * @param predicate A predicate like `array.filter(item => boolean)`
   */
  deleteMany(predicate) {
    return __async(this, null, function* () {
      const list = yield this.list();
      for (const item of list) {
        if (predicate(item)) {
          yield this.sb.delete(item.name);
          yield this.sb.delete(`${PREFIX_METADATA}${item.name}`);
        }
      }
    });
  }
  /**
   * Write the metadata of the file to disk.
   */
  writeMetadata(name, metadata) {
    return __async(this, null, function* () {
      const blob = new Blob([JSON.stringify(metadata)], { type: "text/plain" });
      yield this.sb.write(`${PREFIX_METADATA}${name}`, blob.stream());
    });
  }
};
var cache_manager_default = CacheManager;
function urlToFileName(url, prefix) {
  return __async(this, null, function* () {
    const hashBuffer = yield crypto.subtle.digest(
      "SHA-1",
      new TextEncoder().encode(url)
    );
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    return `${prefix}${hashHex}_${url.split("/").pop()}`;
  });
}

// src/model-manager.ts
var DEFAULT_PARALLEL_DOWNLOADS = 3;
var ModelValidationStatus = /* @__PURE__ */ ((ModelValidationStatus2) => {
  ModelValidationStatus2["VALID"] = "valid";
  ModelValidationStatus2["INVALID"] = "invalid";
  ModelValidationStatus2["DELETED"] = "deleted";
  return ModelValidationStatus2;
})(ModelValidationStatus || {});
var Model = class {
  constructor(modelManager, url, mmprojUrl, savedFiles) {
    __publicField(this, "modelManager");
    /**
     * URL to the GGUF file (in case it contains multiple shards, the URL should point to the first shard)
     *
     * This URL will be used to identify the model in the cache. There can't be 2 models with the same URL.
     */
    __publicField(this, "url");
    /**
     * URL to mmproj file, if exists
     */
    __publicField(this, "mmprojUrl");
    /**
     * Size in bytes (total size of all shards).
     *
     * A value of -1 means the model is deleted from the cache. You must call `ModelManager.downloadModel` to re-download the model.
     */
    __publicField(this, "size");
    /**
     * List of all shards in the cache, sorted by original URL (ascending order)
     */
    __publicField(this, "files");
    this.modelManager = modelManager;
    this.url = url;
    this.mmprojUrl = mmprojUrl;
    if (savedFiles) {
      this.files = this.getAllFiles(savedFiles);
      this.size = sumArr(this.files.map((f) => f.metadata.originalSize));
    } else {
      this.files = [];
      this.size = 0;
    }
  }
  /**
   * Open and get a list of all shards as Blobs
   */
  open() {
    return __async(this, null, function* () {
      if (this.size === -1) {
        throw new WllamaError(
          `Model is deleted from the cache; Call ModelManager.downloadModel to re-download the model`,
          "load_error"
        );
      }
      const blobs = [];
      for (const file of this.files) {
        const blob = yield this.modelManager.cacheManager.open(file.name);
        if (!blob) {
          throw new Error(
            `Failed to open file ${file.name}; Hint: the model may be invalid, please refresh it`
          );
        }
        blobs.push(blob);
      }
      return blobs;
    });
  }
  /**
   * Validate the model files.
   *
   * If the model is invalid, the model manager will not be able to use it. You must call `refresh` to re-download the model.
   *
   * Cases that model is invalid:
   * - The model is deleted from the cache
   * - The model files are missing (or the download is interrupted)
   */
  validate() {
    let nbShards = ModelManager.parseModelUrl(this.url).length;
    if (this.mmprojUrl) {
      nbShards += 1;
    }
    if (this.size === -1) {
      return "deleted" /* DELETED */;
    }
    if (this.size < 16 || this.files.length !== nbShards) {
      return "invalid" /* INVALID */;
    }
    for (const file of this.files) {
      if (!file.metadata || file.metadata.originalSize !== file.size) {
        return "invalid" /* INVALID */;
      }
    }
    return "valid" /* VALID */;
  }
  /**
   * In case the model is invalid, call this function to re-download the model
   */
  refresh() {
    return __async(this, arguments, function* (options = {}) {
      var _a;
      const urls = ModelManager.parseModelUrl(this.url);
      if (this.mmprojUrl) {
        urls.push(this.mmprojUrl);
      }
      const works = urls.map((url, index) => ({
        url,
        index
      }));
      this.modelManager.logger.debug("Downloading model files:", urls);
      const nParallel = (_a = this.modelManager.params.parallelDownloads) != null ? _a : DEFAULT_PARALLEL_DOWNLOADS;
      const totalSize = yield this.getTotalDownloadSize(urls);
      const loadedSize = [];
      const worker = () => __async(this, null, function* () {
        while (works.length > 0) {
          const w = works.shift();
          if (!w) break;
          yield this.modelManager.cacheManager.download(w.url, __spreadProps(__spreadValues({}, options), {
            metadataAdditional: {
              originalURL: w.url,
              mmprojURL: this.mmprojUrl
            },
            progressCallback: ({ loaded }) => {
              var _a2;
              loadedSize[w.index] = loaded;
              (_a2 = options.progressCallback) == null ? void 0 : _a2.call(options, {
                loaded: sumArr(loadedSize),
                total: totalSize
              });
            }
          }));
        }
      });
      const promises = [];
      for (let i = 0; i < nParallel; i++) {
        promises.push(worker());
        loadedSize.push(0);
      }
      yield Promise.all(promises);
      this.files = this.getAllFiles(yield this.modelManager.cacheManager.list());
      this.size = this.files.reduce((acc, f) => acc + f.metadata.originalSize, 0);
    });
  }
  /**
   * Remove the model from the cache
   */
  remove() {
    return __async(this, null, function* () {
      this.files = this.getAllFiles(yield this.modelManager.cacheManager.list());
      yield this.modelManager.cacheManager.deleteMany(
        (f) => !!this.files.find((file) => file.name === f.name)
      );
      this.size = -1;
    });
  }
  getAllFiles(savedFiles) {
    const allUrls = new Set(ModelManager.parseModelUrl(this.url));
    if (this.mmprojUrl) {
      allUrls.add(this.mmprojUrl);
    }
    const allFiles = [];
    for (const url of allUrls) {
      const file = savedFiles.find((f) => f.metadata.originalURL === url);
      if (!file) {
        throw new Error(`Model file not found: ${url}`);
      }
      allFiles.push(file);
    }
    allFiles.sort(
      (a, b) => a.metadata.originalURL.localeCompare(b.metadata.originalURL)
    );
    return allFiles;
  }
  getTotalDownloadSize(urls) {
    return __async(this, null, function* () {
      const responses = yield Promise.all(
        urls.map((url) => fetch(url, { method: "HEAD" }))
      );
      const sizes = responses.map(
        (res) => Number(res.headers.get("content-length") || "0")
      );
      return sumArr(sizes);
    });
  }
};
var ModelManager = class _ModelManager {
  constructor(params = {}) {
    // The CacheManager singleton, can be accessed by user
    __publicField(this, "cacheManager");
    __publicField(this, "params");
    __publicField(this, "logger");
    this.cacheManager = params.cacheManager || new cache_manager_default();
    this.params = params;
    this.logger = params.logger || console;
  }
  /**
   * Parses a model URL and returns an array of URLs based on the following patterns:
   * - If the input URL is an array, it returns the array itself.
   * - If the input URL is a string in the `gguf-split` format, it returns an array containing the URL of each shard in ascending order.
   * - Otherwise, it returns an array containing the input URL as a single element array.
   * @param modelUrl URL or list of URLs
   */
  static parseModelUrl(modelUrl) {
    var _a;
    if (Array.isArray(modelUrl)) {
      return modelUrl;
    }
    const urlPartsRegex = /-(\d{5})-of-(\d{5})\.gguf(?:\?.*)?$/;
    const queryMatch = modelUrl.match(/\.gguf(\?.*)?$/);
    const queryParams = (_a = queryMatch == null ? void 0 : queryMatch[1]) != null ? _a : "";
    const matches = modelUrl.match(urlPartsRegex);
    if (!matches) {
      return [modelUrl];
    }
    const baseURL = modelUrl.replace(urlPartsRegex, "");
    const total = matches[2];
    const paddedShardIds = Array.from(
      { length: Number(total) },
      (_, index) => (index + 1).toString().padStart(5, "0")
    );
    return paddedShardIds.map(
      (current) => `${baseURL}-${current}-of-${total}.gguf${queryParams}`
    );
  }
  /**
   * Get all models in the cache
   */
  getModels() {
    return __async(this, arguments, function* (opts = {}) {
      const cachedFiles = yield this.cacheManager.list();
      let models = [];
      for (const file of cachedFiles) {
        if (!file.metadata.originalURL) continue;
        const shards = _ModelManager.parseModelUrl(file.metadata.originalURL);
        const mmprojUrl = file.metadata.mmprojURL;
        const isFirstShard = shards.length === 1 || shards[0] === file.metadata.originalURL;
        if (isFirstShard) {
          models.push(
            new Model(this, file.metadata.originalURL, mmprojUrl, cachedFiles)
          );
        }
      }
      if (!opts.includeInvalid) {
        models = models.filter(
          (m) => m.validate() === "valid" /* VALID */
        );
      }
      return models;
    });
  }
  /**
   * Download a model from the given URL.
   *
   * The URL must end with `.gguf`
   */
  downloadModel(_0) {
    return __async(this, arguments, function* (sourceOrURL, options = {}) {
      const source = isString(sourceOrURL) ? { url: sourceOrURL } : sourceOrURL;
      if (!isValidGgufFile(source.url)) {
        throw new WllamaError(
          `Invalid model URL: ${source.url}; URL must ends with ".gguf"`,
          "download_error"
        );
      }
      const model = new Model(this, source.url, source.mmprojUrl);
      const validity = model.validate();
      if (validity !== "valid" /* VALID */) {
        yield model.refresh(options);
      }
      return model;
    });
  }
  /**
   * Get a model from the cache or download it if it's not available.
   */
  getModelOrDownload(_0) {
    return __async(this, arguments, function* (source, options = {}) {
      var _a;
      const models = yield this.getModels();
      const model = models.find((m) => m.url === source.url);
      if (model) {
        (_a = options.progressCallback) == null ? void 0 : _a.call(options, { loaded: model.size, total: model.size });
        return model;
      }
      return this.downloadModel(source, options);
    });
  }
  /**
   * Remove all models from the cache
   */
  clear() {
    return __async(this, null, function* () {
      yield this.cacheManager.clear();
    });
  }
};

// src/types/types.ts
var LogLevel = /* @__PURE__ */ ((LogLevel2) => {
  LogLevel2[LogLevel2["DEBUG"] = 1] = "DEBUG";
  LogLevel2[LogLevel2["INFO"] = 2] = "INFO";
  LogLevel2[LogLevel2["WARN"] = 3] = "WARN";
  LogLevel2[LogLevel2["ERROR"] = 4] = "ERROR";
  return LogLevel2;
})(LogLevel || {});

// src/wasm-from-cdn.ts
var WasmCompatFromCDN = {
  worker: "https://cdn.jsdelivr.net/npm/@wllama/wllama-compat@3.6.0/wasm/wllama.js",
  wasm: "https://cdn.jsdelivr.net/npm/@wllama/wllama-compat@3.6.0/wasm/wllama.wasm"
};

// src/wllama.ts
var LoggerWithoutDebug = __spreadProps(__spreadValues({}, console), {
  debug: () => {
  }
});
var WllamaError = class extends Error {
  constructor(message, type = "unknown_error") {
    super(message);
    __publicField(this, "type");
    this.type = type;
  }
};
var WllamaAbortError = class extends Error {
  constructor() {
    super("Operation aborted");
    __publicField(this, "name", "AbortError");
  }
};
var WllamaRuntimeError = class extends Error {
  constructor(message, stack) {
    super(message);
    __publicField(this, "name", "RuntimeError");
    __publicField(this, "stack");
    this.stack = stack;
  }
};
var Wllama = class {
  constructor(pathConfig, wllamaConfig = {}) {
    // The CacheManager and ModelManager are singleton, can be accessed by user
    __publicField(this, "cacheManager");
    __publicField(this, "modelManager");
    __publicField(this, "compat", null);
    __publicField(this, "proxy", null);
    __publicField(this, "config");
    __publicField(this, "pathConfig");
    __publicField(this, "useMultiThread", false);
    __publicField(this, "nbThreads", 1);
    __publicField(this, "useEmbeddings", false);
    __publicField(this, "useRerank", false);
    // available when loaded
    __publicField(this, "loadedContextInfo", null);
    __publicField(this, "seed");
    __publicField(this, "bosToken", -1);
    __publicField(this, "eosToken", -1);
    __publicField(this, "eotToken", -1);
    __publicField(this, "eogTokens", /* @__PURE__ */ new Set());
    __publicField(this, "addBosToken", false);
    __publicField(this, "addEosToken", false);
    __publicField(this, "mediaMarker");
    __publicField(this, "chatTemplate");
    __publicField(this, "metadata");
    __publicField(this, "hasEncoder", false);
    __publicField(this, "decoderStartToken", -1);
    // note: we overlay instead of using llama-server default_template_kwargs, because we cannot transfer complex data structure via GLUE
    // overlay allow mixed data type or nested structure for kwargs
    __publicField(this, "chatTemplateKwargs", {});
    var _a, _b, _c;
    checkEnvironmentCompatible();
    if (!pathConfig) throw new WllamaError("AssetsPathConfig is required");
    this.pathConfig = pathConfig;
    this.config = wllamaConfig;
    this.cacheManager = (_a = wllamaConfig.cacheManager) != null ? _a : new cache_manager_default();
    this.modelManager = (_c = wllamaConfig.modelManager) != null ? _c : new ModelManager({
      cacheManager: this.cacheManager,
      logger: (_b = wllamaConfig.logger) != null ? _b : console,
      parallelDownloads: wllamaConfig.parallelDownloads,
      allowOffline: wllamaConfig.allowOffline
    });
    this.setCompat("default");
  }
  logger() {
    var _a;
    return (_a = this.config.logger) != null ? _a : console;
  }
  checkModelLoaded() {
    if (!this.isModelLoaded()) {
      throw new WllamaError(
        "loadModel() is not yet called",
        "model_not_loaded"
      );
    }
  }
  /**
   * Get the libllama version string, e.g. "b6327-4d74393".
   *
   * @returns version string embedded at build time.
   */
  static getLibllamaVersion() {
    return LIBLLAMA_VERSION;
  }
  /**
   * Set compatibility options for Wllama.
   * @param compat Set to null to disable compatibility, or 'default' to use the default compat resources from CDN.
   * @param mode 'safari' by default; If set to 'firefox_safari', the compat mode will **also** be enabled on Firefox, which will significantly degrade the performance but allow using WebGPU on Firefox.
   */
  setCompat(compat, mode = "safari") {
    if (mode === "safari") {
      if (isFirefox()) {
        this.compat = null;
        return;
      }
    }
    this.compat = compat === "default" ? WasmCompatFromCDN : compat;
  }
  /**
   * Check if the model is loaded via `loadModel()`
   */
  isModelLoaded() {
    return !!this.proxy && !!this.metadata;
  }
  /**
   * Get token ID associated to BOS (begin of sentence) token.
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns -1 if the model is not loaded.
   */
  getBOS() {
    return this.bosToken;
  }
  /**
   * Get token ID associated to EOS (end of sentence) token.
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns -1 if the model is not loaded.
   */
  getEOS() {
    return this.eosToken;
  }
  /**
   * Get token ID associated to EOT (end of turn) token.
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns -1 if the model is not loaded.
   */
  getEOT() {
    return this.eotToken;
  }
  /**
   * Check if a given token is end-of-generation token (e.g. EOS, EOT, etc.)
   *
   * @param token the token ID to be checked
   * @returns true if the token is EOS, EOT, or any other end-of-generation tokens
   */
  isTokenEOG(token) {
    return token === this.eosToken || token === this.eotToken || this.eogTokens.has(token);
  }
  /**
   * Get token ID associated to token used by decoder, to start generating output sequence(only usable for encoder-decoder architecture). In other words, encoder uses normal BOS and decoder uses this token.
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns -1 if the model is not loaded.
   */
  getDecoderStartToken() {
    return this.decoderStartToken;
  }
  /**
   * Get model hyper-parameters and metadata
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns ModelMetadata
   */
  getModelMetadata() {
    this.checkModelLoaded();
    return this.metadata;
  }
  /**
   * Check if we're currently using multi-thread build.
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns true if multi-thread is used.
   */
  isMultithread() {
    this.checkModelLoaded();
    return this.useMultiThread;
  }
  /**
   * Get number of threads used in the current context.
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns number of threads
   */
  getNumThreads() {
    this.checkModelLoaded();
    return this.useMultiThread ? this.nbThreads : 1;
  }
  /**
   * Check if the current model uses encoder-decoder architecture
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns true if multi-thread is used.
   */
  isEncoderDecoderArchitecture() {
    this.checkModelLoaded();
    return this.hasEncoder;
  }
  /**
   * Must we add BOS token to the tokenized sequence?
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns true if BOS token must be added to the sequence
   */
  mustAddBosToken() {
    this.checkModelLoaded();
    return this.addBosToken;
  }
  /**
   * Must we add EOS token to the tokenized sequence?
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns true if EOS token must be added to the sequence
   */
  mustAddEosToken() {
    this.checkModelLoaded();
    return this.addEosToken;
  }
  /**
   * Get the jinja chat template comes with the model. It only available if the original model (before converting to gguf) has the template in `tokenizer_config.json`
   *
   * NOTE: This can only being used after `loadModel` is called.
   *
   * @returns the jinja template. null if there is no template in gguf
   */
  getChatTemplate() {
    var _a;
    this.checkModelLoaded();
    return (_a = this.chatTemplate) != null ? _a : null;
  }
  /**
   * Check if WebGPU is supported by the current environment.
   * @returns true if WebGPU is supported
   */
  isSupportWebGPU() {
    return isSupportWebGPU();
  }
  /**
   * Load model from a given URL (or a list of URLs, in case the model is splitted into smaller files)
   * - If the model already been downloaded (via `downloadModel()`), then we will use the cached model
   * - Else, we download the model from internet
   * @param modelSourceOrURL
   * @param params
   */
  loadModelFromUrl(_0) {
    return __async(this, arguments, function* (modelSourceOrURL, params = {}) {
      var _a;
      const source = isString(modelSourceOrURL) ? { url: modelSourceOrURL } : modelSourceOrURL;
      const useCache = (_a = params.useCache) != null ? _a : true;
      const model = useCache ? yield this.modelManager.getModelOrDownload(source, params) : yield this.modelManager.downloadModel(source, params);
      const blobs = yield model.open();
      return yield this.loadModel(blobs, params);
    });
  }
  /**
   * Load model from a given Hugging Face model ID and file path.
   *
   * @param hfOptions
   * @param params
   */
  loadModelFromHF(_0) {
    return __async(this, arguments, function* (hfOptions, params = {}) {
      const source = yield getHFModelSource(hfOptions);
      return yield this.loadModelFromUrl(source, params);
    });
  }
  /**
   * Load model from a given list of Blob.
   *
   * You can pass multiple buffers into the function (in case the model contains multiple shards).
   *
   * @param ggufBlobsOrModel Can be either list of Blobs (in case you use local file), or a Model object (in case you use ModelManager)
   * @param params LoadModelParams
   */
  loadModel(_0) {
    return __async(this, arguments, function* (ggufBlobsOrModel, params = {}) {
      var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j;
      const blobs = ggufBlobsOrModel instanceof Model ? yield ggufBlobsOrModel.open() : [...ggufBlobsOrModel];
      if (blobs.some((b) => b.size === 0)) {
        throw new WllamaError(
          "Input model (or splits) must be non-empty Blob or File",
          "load_error"
        );
      }
      if (!this.pathConfig["default"]) {
        throw new WllamaError(
          '"default" is missing from pathConfig',
          "load_error"
        );
      }
      if (this.proxy) {
        throw new WllamaError("Module is already initialized", "load_error");
      }
      const supportMultiThread = yield isSupportMultiThread();
      const hwConccurency = Math.floor((navigator.hardwareConcurrency || 1) / 2);
      const nbThreads = (_a = params.n_threads) != null ? _a : hwConccurency;
      this.nbThreads = nbThreads;
      this.useMultiThread = supportMultiThread && nbThreads > 1;
      const workerResources = this.getWorkerResources();
      if (params.n_gpu_layers === 0) {
        workerResources.noWebGPU = true;
      }
      this.proxy = new ProxyToWorker(
        workerResources,
        this.useMultiThread ? nbThreads : 0,
        // 0 means disable pthread
        (_b = this.config.suppressNativeLog) != null ? _b : false,
        this.logger()
      );
      let logLevel = (_c = params.log_level) != null ? _c : 2 /* INFO */;
      if (this.config.suppressNativeLog) {
        logLevel = 9999;
      }
      const modelFiles = yield prepareBlobs(blobs);
      yield this.proxy.moduleInit(modelFiles.all);
      this.logger().debug("Calling wllamaStart...");
      const startResult = yield this.proxy.wllamaStart();
      if (!startResult.success) {
        throw new WllamaError(
          `Error while calling start function, result = ${startResult}`
        );
      }
      this.logger().debug("Loading model...");
      const loadResult = yield this.proxy.wllamaAction("load", {
        _name: "load_req",
        log_level: logLevel,
        // if async read is not supported, use mmap; refer to README-dev.md for more details
        use_mmap: !canUseAsyncFileRead(workerResources.compat),
        use_mlock: false,
        n_gpu_layers: (_d = params.n_gpu_layers) != null ? _d : 99999,
        n_ctx: (_e = params.n_ctx) != null ? _e : 1024,
        n_threads: this.useMultiThread ? nbThreads : 1,
        n_ctx_auto: false,
        // not supported for now
        mmproj_path: modelFiles.mmproj ? `/models/${MMPROJ_FILE_NAME}` : void 0,
        model_paths: modelFiles.llm.map((f) => `models/${f.name}`),
        embeddings: params.embeddings,
        offload_kqv: params.offload_kqv,
        n_batch: params.n_batch,
        n_ubatch: params.n_ubatch,
        pooling_type: params.pooling_type,
        rope_scaling_type: params.rope_scaling_type,
        rope_freq_base: params.rope_freq_base,
        rope_freq_scale: params.rope_freq_scale,
        yarn_ext_factor: params.yarn_ext_factor,
        yarn_attn_factor: params.yarn_attn_factor,
        yarn_beta_fast: params.yarn_beta_fast,
        yarn_beta_slow: params.yarn_beta_slow,
        yarn_orig_ctx: params.yarn_orig_ctx,
        cache_type_k: params.cache_type_k,
        cache_type_v: params.cache_type_v,
        // with unified KV, all sequences share one n_ctx cache, so each request can still use the full context
        n_parallel: (_f = params.n_parallel) != null ? _f : 4,
        kv_unified: (_g = params.kv_unified) != null ? _g : true,
        flash_attn: params.flash_attn,
        swa_full: params.swa_full,
        chat_template: params.chat_template,
        jinja: params.jinja,
        reasoning: params.reasoning,
        image_min_tokens: params.image_min_tokens,
        image_max_tokens: params.image_max_tokens,
        warmup: params.warmup,
        no_kv_offload: params.no_kv_offload,
        mmproj_offload: params.mmproj_offload,
        cont_batching: params.cont_batching,
        n_keep: params.n_keep,
        ctx_shift: params.ctx_shift,
        cache_idle_slots: params.cache_idle_slots,
        n_cache_reuse: params.n_cache_reuse,
        lora_paths: (_h = params.lora_adapters) == null ? void 0 : _h.map((a) => a.path),
        lora_scales: (_i = params.lora_adapters) == null ? void 0 : _i.map((a) => {
          var _a2;
          return (_a2 = a.scale) != null ? _a2 : 1;
        }),
        lora_init_without_apply: params.lora_init_without_apply,
        spec_draft_model: params.spec_draft_model,
        spec_draft_ngl: params.spec_draft_ngl,
        spec_draft_n_max: params.spec_draft_n_max,
        spec_draft_n_min: params.spec_draft_n_min,
        spec_draft_p_min: params.spec_draft_p_min,
        spec_draft_threads: params.spec_draft_threads,
        spec_draft_threads_batch: params.spec_draft_threads_batch,
        kv_overrides_keys: params.kv_overrides ? Object.keys(params.kv_overrides) : void 0,
        kv_overrides_vals: params.kv_overrides ? Object.values(params.kv_overrides) : void 0,
        reasoning_budget_tokens: params.reasoning_budget_tokens,
        reasoning_budget_message: params.reasoning_budget_message,
        reasoning_format: params.reasoning_format,
        skip_chat_parsing: params.skip_chat_parsing,
        prefill_assistant: params.prefill_assistant
      });
      const loadedCtxInfo = __spreadProps(__spreadValues({}, loadResult), {
        metadata: {}
      });
      for (let i = 0; i < loadResult.metadata_key.length; i++) {
        loadedCtxInfo.metadata[loadResult.metadata_key[i]] = loadResult.metadata_val[i];
      }
      this.seed = params.seed;
      this.bosToken = loadedCtxInfo.token_bos;
      this.eosToken = loadedCtxInfo.token_eos;
      this.eotToken = loadedCtxInfo.token_eot;
      this.useEmbeddings = !!params.embeddings;
      this.useRerank = params.pooling_type == "rank";
      this.metadata = {
        hparams: {
          nVocab: loadedCtxInfo.n_vocab,
          nCtxTrain: loadedCtxInfo.n_ctx_train,
          nEmbd: loadedCtxInfo.n_embd,
          nLayer: loadedCtxInfo.n_layer
        },
        meta: loadedCtxInfo.metadata
      };
      this.hasEncoder = !!loadedCtxInfo.has_encoder;
      this.decoderStartToken = loadedCtxInfo.token_decoder_start;
      this.addBosToken = loadedCtxInfo.add_bos_token;
      this.addEosToken = loadedCtxInfo.add_eos_token;
      this.chatTemplate = loadedCtxInfo.metadata["tokenizer.chat_template"];
      this.loadedContextInfo = loadedCtxInfo;
      this.eogTokens = new Set(loadedCtxInfo.list_tokens_eog);
      this.mediaMarker = loadedCtxInfo.media_marker;
      this.chatTemplateKwargs = (_j = params.default_template_kwargs) != null ? _j : {};
      this.logger().debug({ loadedCtxInfo });
    });
  }
  getLoadedContextInfo() {
    this.checkModelLoaded();
    if (!this.loadedContextInfo) {
      throw new WllamaError("Loaded context info is not available");
    }
    return __spreadValues({}, this.loadedContextInfo);
  }
  //////////////////////////////////////////////
  // High level API
  /**
   * Calculate embedding vector for a given text.
   * By default, BOS and EOS tokens will be added automatically. You can use the "skipBOS" and "skipEOS" option to disable it.
   * @param options OAI-compatible embedding creation options
   * @returns OAI-compatible embedding response
   */
  createEmbedding(options) {
    return __async(this, null, function* () {
      this.checkModelLoaded();
      if (!this.useEmbeddings) {
        throw new WllamaError(
          "Embeddings is not enabled. Please set it via LoadModelParams.embeddings"
        );
      }
      const result = yield this.proxy.wllamaAction(
        "embedding",
        {
          _name: "embd_req",
          data_json: JSON.stringify(options),
          files: []
          // TODO: support file input
        }
      );
      if (!result.success) {
        throw new WllamaError(
          "Model failed to start inference",
          "inference_error"
        );
      }
      return yield this.getResponse(options, false, result.req_id);
    });
  }
  /**
   * Rerank a list of documents against a query.
   * Requires the model to be loaded with embeddings: true and pooling_type: 'rank'.
   * @param options Reranking options (query, documents, top_n)
   * @returns Reranking response with relevance scores sorted highest first
   */
  createRerank(options) {
    return __async(this, null, function* () {
      var _a, _b;
      this.checkModelLoaded();
      if (!this.useEmbeddings || !this.useRerank) {
        throw new WllamaError(
          "Rerank is not enabled. Please set it via LoadModelParams: embeddings = true and pooling_type = rank"
        );
      }
      const top_n = (_a = options.top_n) != null ? _a : options.documents.length;
      let totalTokens = 0;
      const rawResults = [];
      for (let i = 0; i < options.documents.length; i++) {
        const result = yield this.proxy.wllamaAction("rerank", {
          _name: "rrnk_req",
          data_json: JSON.stringify({
            query: options.query,
            document: options.documents[i]
          })
        });
        if (!result.success) {
          throw new WllamaError(
            "Model failed to start reranking",
            "inference_error"
          );
        }
        const { score, tokens_evaluated } = yield this.getRerankResult(
          result.req_id
        );
        totalTokens += tokens_evaluated;
        rawResults.push({ index: i, score });
      }
      rawResults.sort((a, b) => b.score - a.score);
      return {
        model: (_b = this.getModelMetadata().meta["general.name"]) != null ? _b : "",
        object: "list",
        usage: { prompt_tokens: totalTokens, total_tokens: totalTokens },
        results: rawResults.slice(0, top_n).map(({ index, score }) => ({
          index,
          relevance_score: score
        }))
      };
    });
  }
  createChatCompletion(options) {
    return __async(this, null, function* () {
      var _a;
      if (Object.keys(this.chatTemplateKwargs).length > 0) {
        options = __spreadProps(__spreadValues({}, options), {
          chat_template_kwargs: __spreadValues(__spreadValues({}, this.chatTemplateKwargs), (_a = options.chat_template_kwargs) != null ? _a : {})
        });
      }
      if (options.stream && options.onData) {
        yield this.createCompletionImpl(options);
      } else if (options.stream) {
        return yield this.createCompletionGenerator(options);
      } else {
        return yield this.createCompletionImpl(__spreadProps(__spreadValues({}, options), { stream: false }));
      }
    });
  }
  createCompletion(options) {
    return __async(this, null, function* () {
      if (options.stream && options.onData) {
        yield this.createCompletionImpl(options);
      } else if (options.stream) {
        return yield this.createCompletionGenerator(options);
      } else {
        return yield this.createCompletionImpl(__spreadProps(__spreadValues({}, options), { stream: false }));
      }
    });
  }
  /**
   * Private implementation of createCompletion
   */
  createCompletionImpl(options) {
    return __async(this, null, function* () {
      this.checkModelLoaded();
      const isStream = !!options.stream;
      const isChat = !!options.messages;
      const customOpt = {};
      if (this.seed !== void 0) {
        customOpt.seed = this.seed;
      }
      let files = [];
      if (isChat) {
        const tmp = this.prepareMultimodalInput(
          options
        );
        options = tmp.params;
        files = tmp.files;
      }
      const result = yield this.proxy.wllamaAction(
        "completion",
        {
          _name: "cmpl_req",
          is_chat: isChat,
          data_json: JSON.stringify(__spreadValues(__spreadValues({}, options), customOpt)),
          files: files.map((f) => new Uint8Array(f))
        }
      );
      if (!result.success) {
        throw new WllamaError(
          "Model failed to start inference",
          "inference_error"
        );
      }
      return yield this.getResponse(
        options,
        isStream,
        result.req_id
      );
    });
  }
  /**
   * Same with `createCompletion`, but returns an async iterator instead.
   * Only called when stream=true and no onData is provided.
   */
  createCompletionGenerator(options) {
    return new Promise((resolve) => {
      const createGenerator = cbToAsyncIter(
        (callback) => {
          this.createCompletionImpl(__spreadProps(__spreadValues({}, options), {
            onData: (chunk) => callback(chunk)
          })).then(() => callback(void 0, true)).catch((err) => callback(void 0, false, err));
        }
      );
      resolve(createGenerator());
    });
  }
  /**
   * Whether the currently loaded model supports a specific input modality (e.g. image or audio).
   * @param modality
   * @returns
   */
  supportInputModality(modality) {
    this.checkModelLoaded();
    if (modality === "image") {
      return !!this.loadedContextInfo.has_image_input;
    } else if (modality === "audio") {
      return !!this.loadedContextInfo.has_audio_input;
    } else {
      throw new WllamaError(
        "Unsupported modality: " + modality,
        "unknown_error"
      );
    }
  }
  /**
   * Unload the model and free all memory.
   *
   * Note: This function will NOT crash if model is not yet loaded
   */
  exit() {
    return __async(this, null, function* () {
      var _a;
      yield (_a = this.proxy) == null ? void 0 : _a.wllamaExit();
      this.proxy = null;
    });
  }
  /**
   * [FOR DEBUGGING ONLY] Run ggml backend ops tests without loading any model.
   *
   * Initializes the wasm runtime, executes `test-backend-ops` with the given args, then shuts down.
   *
   * For more info, please refer to guides/debug.md
   *
   * @param args Arguments forwarded to test-backend-ops (e.g. ["-o", "ADD"])
   * @returns retcode (0 = all tests passed) and success flag
   */
  testBackendOps() {
    return __async(this, arguments, function* (args = []) {
      var _a;
      if (!this.pathConfig["default"]) {
        throw new WllamaError(
          '"default" is missing from pathConfig',
          "load_error"
        );
      }
      if (!(yield isSupportMultiThread())) {
        throw new WllamaError(
          "Multi-threading is required to run backend ops tests, but it is not supported in the current environment."
        );
      }
      const tmpProxy = new ProxyToWorker(
        this.getWorkerResources(),
        0,
        // single-thread; no model needed
        (_a = this.config.suppressNativeLog) != null ? _a : false,
        this.logger()
      );
      try {
        yield tmpProxy.moduleInit([]);
        const startResult = yield tmpProxy.wllamaStart();
        if (!startResult.success) {
          throw new WllamaError(
            `Error while calling start function, result = ${startResult}`
          );
        }
        const result = yield tmpProxy.wllamaAction(
          "test_backend_ops",
          { _name: "tbop_req", args: ["test-backend-ops", ...args] }
        );
        return { retcode: result.retcode, success: result.success };
      } finally {
        yield tmpProxy.wllamaExit();
      }
    });
  }
  //////////////////////////////////////////////
  // Low level API
  // TODO: add back
  /**
   * get debug info
   */
  _getDebugInfo() {
    return __async(this, null, function* () {
      this.checkModelLoaded();
      return yield this.proxy.wllamaDebug();
    });
  }
  //////////////////////////////////////////////
  // Utils
  jsonDecode(data_json) {
    try {
      return JSON.parse(data_json);
    } catch (e) {
      this.logger().error("Failed to parse JSON:", data_json);
      throw new WllamaError("Failed to parse model output", "inference_error");
    }
  }
  prepareMultimodalInput(params) {
    const msg = params.messages;
    const msgNew = [];
    const files = [];
    for (const m of msg) {
      if (Array.isArray(m.content)) {
        const newContent = [];
        for (const c of m.content) {
          if (c.type === "text") {
            newContent.push(c);
          } else {
            if (!this.mediaMarker) {
              throw new WllamaError(
                "Media marker is undefined",
                "inference_error"
              );
            }
            files.push(c.data);
            newContent.push({
              type: "text",
              text: this.mediaMarker
            });
          }
        }
        msgNew.push(__spreadProps(__spreadValues({}, m), {
          content: newContent
        }));
      } else {
        msgNew.push(m);
      }
    }
    return {
      params: __spreadProps(__spreadValues({}, params), {
        messages: msgNew
      }),
      files
    };
  }
  // release the slot occupied by the request; cancelling an already-finished request is a no-op
  cancelRequest(reqId) {
    return __async(this, null, function* () {
      try {
        yield this.proxy.wllamaAction("cancel", {
          _name: "cncl_req",
          req_id: reqId
        });
      } catch (e) {
        this.logger().warn("Failed to cancel request", reqId, e);
      }
    });
  }
  getRerankResult(reqId) {
    return __async(this, null, function* () {
      let completed = false;
      try {
        while (true) {
          const chunk = yield this.proxy.wllamaAction(
            "get_result",
            { _name: "gres_req", req_id: reqId }
          );
          const jsonString = chunk.data_json;
          if (jsonString && jsonString.length > 0) {
            if (chunk.is_error) {
              const jsonData = this.jsonDecode(jsonString);
              throw new WllamaError(
                jsonData.message || "Unknown reranking error",
                "inference_error"
              );
            }
            completed = true;
            return this.jsonDecode(jsonString);
          }
          if (!chunk.has_more) {
            completed = true;
            break;
          }
        }
        throw new WllamaError("No reranking result received", "inference_error");
      } finally {
        if (!completed) {
          yield this.cancelRequest(reqId);
        }
      }
    });
  }
  getResponse(options, isStream, reqId) {
    return __async(this, null, function* () {
      var _a, _b;
      let finalResult = null;
      let completed = false;
      try {
        while (true) {
          if ((_a = options.abortSignal) == null ? void 0 : _a.aborted) {
            throw new WllamaAbortError();
          }
          const result_chunk = yield this.proxy.wllamaAction(
            "get_result",
            {
              _name: "gres_req",
              req_id: reqId
            }
          );
          const jsonString = result_chunk.data_json;
          if (!jsonString || jsonString.length === 0) {
            if (!result_chunk.has_more) {
              completed = true;
              break;
            } else {
              continue;
            }
          }
          if (jsonString == "null") {
            continue;
          }
          let jsonData = this.jsonDecode(jsonString);
          finalResult = jsonData;
          if (result_chunk.is_error) {
            this.logger().error("Model returned an error:", jsonData);
            throw new WllamaError(
              jsonData.message || "Unknown inference error",
              "inference_error"
            );
          }
          if (isStream) {
            if (!Array.isArray(jsonData)) {
              jsonData = [jsonData];
            }
            for (const chunk of jsonData) {
              (_b = options.onData) == null ? void 0 : _b.call(options, chunk);
              finalResult = chunk;
            }
          }
          if (!result_chunk.has_more) {
            completed = true;
            break;
          }
        }
      } finally {
        if (!completed) {
          yield this.cancelRequest(reqId);
        }
      }
      return finalResult;
    });
  }
  getWorkerResources() {
    const workerResources = {
      wasmPath: absoluteUrl(this.pathConfig["default"]),
      compat: false
    };
    if (needCompat()) {
      if (!this.compat) {
        this.logger().warn(
          "Not using compat mode" + (isFirefox() ? " (expected on Firefox - WebGPU will be disabled)" : "")
        );
      } else {
        const isUsingDefault = this.compat.worker === WasmCompatFromCDN.worker && this.compat.wasm === WasmCompatFromCDN.wasm;
        if (isUsingDefault) {
          this.logger().warn(
            "Compatibility mode is activated, using resources from CDN. To use local resources, please refer to @wllama/wllama-compat package."
          );
          this.logger().warn(
            "IMPORTANT: Performance will be significantly degraded in compatibility mode."
          );
        }
        workerResources.wasmPath = absoluteUrl(this.compat.wasm);
        workerResources.jsPath = this.compat.worker;
        workerResources.compat = true;
      }
    }
    if (isFirefox()) {
      if (workerResources.compat) {
        this.logger().warn(
          'Using compat mode on Firefox, performance will be significantly degraded; Consider enabling "javascript.options.wasm_js_promise_integration" in "about:config".'
        );
      } else if (!isSupportJSPI()) {
        this.logger().warn(
          'WebGPU is disabled on Firefox due to missing JSPI support. Please consider enabling compat mode, or enabling "javascript.options.wasm_js_promise_integration" in "about:config".'
        );
      }
    }
    return workerResources;
  }
};
export {
  CacheManager,
  LogLevel,
  LoggerWithoutDebug,
  Model,
  ModelManager,
  ModelValidationStatus,
  POLYFILL_ETAG,
  Wllama,
  WllamaAbortError,
  WllamaError,
  WllamaRuntimeError,
  getHFFileSHA256,
  getHFModelSource,
  isValidGgufFile
};
