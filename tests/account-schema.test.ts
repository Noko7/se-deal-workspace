import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ACCOUNT_SCHEMA, schemaStats } from "@/lib/account-schema";

describe("account schema catalog", () => {
  it("has the core objects an SE/AE and Account-AI rely on", () => {
    const keys = ACCOUNT_SCHEMA.map((o) => o.key);
    for (const expected of ["account", "opportunity", "contact", "activity", "note", "transcript"]) {
      assert.ok(keys.includes(expected), `missing object: ${expected}`);
    }
  });

  it("every object has fields and required metadata", () => {
    for (const object of ACCOUNT_SCHEMA) {
      assert.ok(object.fields.length > 0, `${object.key} has no fields`);
      for (const field of object.fields) {
        assert.ok(field.key, "field missing key");
        assert.ok(field.label, `${field.key} missing label`);
        assert.ok(field.sfdcObject, `${field.key} missing sfdcObject`);
        assert.ok(field.sfdcApiName, `${field.key} missing sfdcApiName`);
        assert.ok(field.description, `${field.key} missing description`);
        assert.ok(field.seValue, `${field.key} missing seValue`);
      }
    }
  });

  it("custom fields use a __c api name; standard fields do not", () => {
    for (const object of ACCOUNT_SCHEMA) {
      for (const field of object.fields) {
        if (field.custom) {
          assert.ok(
            field.sfdcApiName.endsWith("__c"),
            `${object.key}.${field.key} is custom but api name is ${field.sfdcApiName}`,
          );
        } else {
          assert.ok(
            !field.sfdcApiName.endsWith("__c"),
            `${object.key}.${field.key} is standard but api name is ${field.sfdcApiName}`,
          );
        }
      }
    }
  });

  it("field keys are unique within an object", () => {
    for (const object of ACCOUNT_SCHEMA) {
      const seen = new Set<string>();
      for (const field of object.fields) {
        assert.ok(!seen.has(field.key), `duplicate key ${field.key} in ${object.key}`);
        seen.add(field.key);
      }
    }
  });

  it("stats add up", () => {
    const stats = schemaStats();
    const totalFields = ACCOUNT_SCHEMA.reduce((sum, o) => sum + o.fields.length, 0);
    assert.equal(stats.objectCount, ACCOUNT_SCHEMA.length);
    assert.equal(stats.fieldCount, totalFields);
    assert.equal(stats.standardCount + stats.customCount, totalFields);
  });
});
