import * as properties from 'mdn-data/css/properties.json';
import * as syntaxes from 'mdn-data/css/syntaxes.json';
import * as cssTypes from 'mdn-data/css/types.json';
import parse, {
  Combinator,
  Component,
  ComponentType,
  Entity,
  EntityType,
  ICombinator,
  IFunction,
  IMultiplierCurlyBracet,
  Multiplier,
  MultiplierType,
} from './parser';

export enum Type {
  Alias,
  DataType,
  Length,
  StringLiteral,
  NumericLiteral,
  String,
  Number,
}

interface IBasic {
  type: Type.String | Type.Number | Type.Length;
}

export interface IAlias {
  type: Type.Alias;
  name: string;
  generics: IGenerics[];
}

export interface IGenerics {
  name: string;
  defaults?: string;
}

export interface IDataType {
  type: Type.DataType;
  name: string;
}

export interface IStringLiteral {
  type: Type.StringLiteral;
  literal: string;
}

interface INumericLiteral {
  type: Type.NumericLiteral;
  literal: number;
}

// Yet another reminder; naming is hard
export type TypeType<TAlias = IDataType> = IBasic | IStringLiteral | INumericLiteral | TAlias;

const basicDataTypes = [...Object.keys(cssTypes), 'hex-color'].reduce<{
  [name: string]: IBasic;
}>((dataTypes, name) => {
  switch (name) {
    case 'number':
    case 'integer':
      dataTypes[name] = {
        type: Type.Number,
      };
      break;
    case 'length':
      dataTypes[name] = {
        type: Type.Length,
      };
      break;
    default:
      if (!(name in syntaxes)) {
        dataTypes[name] = {
          type: Type.String,
        };
      }
  }
  return dataTypes;
}, {});

export default function typing(entities: EntityType[]): TypeType[] {
  let types: TypeType[] = [];
  for (const entity of entities) {
    if (isComponent(entity)) {
      if (shouldIncludeComponent(entity)) {
        switch (entity.component) {
          case Component.Keyword:
            if (String(Number(entity.value)) === entity.value) {
              types = addNumericLiteral(types, Number(entity.value));
            } else {
              types = addStringLiteral(types, entity.value);
            }
            break;
          case Component.DataType: {
            const value = entity.value.slice(1, -1);
            const property = /'([^']+)'/.exec(value);
            if (property) {
              const name = property[1];
              if (name in properties) {
                if (entity.multiplier && isMultiplied(entity.multiplier)) {
                  types = addString(types);
                }

                for (const type of typing(parse(properties[name].syntax))) {
                  types = addType(types, type);
                }
              } else {
                types = addString(types);
              }
            } else if (value in basicDataTypes) {
              types = addType(types, basicDataTypes[value]);
            } else {
              types = addDataType(types, value);
            }
            break;
          }
          case Component.Group: {
            if (entity.multiplier && isMultiplied(entity.multiplier)) {
              types = addString(types);
            }

            for (const type of typing(entity.entities)) {
              types = addType(types, type);
            }
          }
        }
      }
    } else if (isCombinator(entity)) {
      if (entity.combinator === Combinator.DoubleBar || isMandatoryCombinator(entity)) {
        types = addString(types);
      }
    } else if (isFunction(entity)) {
      types = addString(types);
    }
  }

  function previousEntity(currentEntity: EntityType) {
    return entities[entities.indexOf(currentEntity) - 1];
  }

  function nextEntity(currentEntity: EntityType) {
    return entities[entities.indexOf(currentEntity) + 1];
  }

  function shouldIncludeComponent(component: ComponentType) {
    for (let i = entities.indexOf(component) - 1; i >= 0; i--) {
      const entity = entities[i];
      if (entity && entity.entity === Entity.Combinator) {
        if (isMandatoryCombinator(entity)) {
          const previous = previousEntity(entity);
          if (previous && !isOptionalEntity(previous)) {
            return false;
          }
        } else {
          break;
        }
      }
    }
    for (let i = entities.indexOf(component) + 1; i < entities.length; i++) {
      const entity = entities[i];
      if (entity && entity.entity === Entity.Combinator) {
        if (isMandatoryCombinator(entity)) {
          const next = nextEntity(entity);
          if (next && !isOptionalEntity(next)) {
            return false;
          }
        } else {
          break;
        }
      }
    }
    return true;
  }

  return types;
}

function addLength(types: TypeType[]): TypeType[] {
  if (types.every(type => type.type !== Type.Length)) {
    return [
      ...types,
      {
        type: Type.Length,
      },
    ];
  }

  return types;
}

function addString(types: TypeType[]): TypeType[] {
  if (types.every(type => type.type !== Type.String)) {
    return [
      ...types,
      {
        type: Type.String,
      },
    ];
  }

  return types;
}

function addNumber(types: TypeType[]): TypeType[] {
  if (types.every(type => type.type !== Type.Number)) {
    return [
      ...types,
      {
        type: Type.Number,
      },
    ];
  }

  return types;
}

function addStringLiteral(types: TypeType[], literal: string): TypeType[] {
  if (types.every(type => !(type.type === Type.StringLiteral && type.literal === literal))) {
    return [
      ...types,
      {
        type: Type.StringLiteral,
        literal,
      },
    ];
  }

  return types;
}

function addNumericLiteral(types: TypeType[], literal: number): TypeType[] {
  if (types.every(type => !(type.type === Type.NumericLiteral && type.literal === literal))) {
    return [
      ...types,
      {
        type: Type.NumericLiteral,
        literal,
      },
    ];
  }

  return types;
}

function addDataType(types: TypeType[], name: string): TypeType[] {
  if (types.every(type => !(type.type === Type.DataType && type.name === name))) {
    return [
      ...types,
      {
        type: Type.DataType,
        name,
      },
    ];
  }

  return types;
}

export function addType(types: TypeType[], type: TypeType): TypeType[] {
  switch (type.type) {
    case Type.Length:
      return addLength(types);
    case Type.String:
      return addString(types);
    case Type.Number:
      return addNumber(types);
    case Type.StringLiteral:
      return addStringLiteral(types, type.literal);
    case Type.NumericLiteral:
      return addNumericLiteral(types, type.literal);
    case Type.DataType:
      return addDataType(types, type.name);
  }
}

function isFunction(entity: EntityType): entity is IFunction {
  return entity.entity === Entity.Function;
}

function isComponent(entity: EntityType): entity is ComponentType {
  return entity.entity === Entity.Component;
}

function isCombinator(entity: EntityType): entity is ICombinator {
  return entity.entity === Entity.Combinator;
}

function isCurlyBracetMultiplier(multiplier: MultiplierType): multiplier is IMultiplierCurlyBracet {
  return multiplier.sign === Multiplier.CurlyBracet;
}

function isMultiplied(multiplier: MultiplierType) {
  return (
    (isCurlyBracetMultiplier(multiplier) && (multiplier.min > 1 || multiplier.max > 1)) ||
    multiplier.sign === Multiplier.Asterisk ||
    multiplier.sign === Multiplier.PlusSign ||
    multiplier.sign === Multiplier.HashMark ||
    multiplier.sign === Multiplier.ExclamationPoint
  );
}

function isMandatoryCombinator({ combinator }: ICombinator) {
  return combinator === Combinator.DoubleAmpersand || combinator === Combinator.Juxtaposition;
}

function isOptionalEntity(entity: EntityType) {
  return (
    entity.multiplier &&
    ((isCurlyBracetMultiplier(entity.multiplier) && entity.multiplier.min > 0) ||
      entity.multiplier.sign === Multiplier.Asterisk ||
      entity.multiplier.sign === Multiplier.QuestionMark)
  );
}
