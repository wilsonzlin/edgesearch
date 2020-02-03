import {buildData, Entry, Field} from './buildData';
import {DSConfig, DSResult} from './ds/ds';
import {incidence} from './ds/incidence';

export const build = async <E extends Entry, Searchable extends Field<E>> ({
  entries,
  searchableFields,
  wordsExtractor,
  maximumAutocompleteSuggestions,
  maximumQueryWords,
  maximumQueryResults,
}: {
  entries: E[];
  searchableFields: Set<Searchable>,
  wordsExtractor: (str: string) => Set<string>;
} & DSConfig): Promise<DSResult> => {
  const data = buildData(entries, searchableFields, {
    wordsExtractor,
  });

  return await incidence(data, {
    maximumQueryWords,
    maximumQueryResults,
    maximumAutocompleteSuggestions,
  });
};
